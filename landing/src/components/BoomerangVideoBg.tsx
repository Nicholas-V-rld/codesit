import { useEffect, useRef, useState } from 'react'
import { HeroBackdrop } from './HeroBackdrop'

/** Drop a real recording at landing/public/codesit-demo.mp4, then rebuild. */
const VIDEO_SRC = '/codesit-demo.mp4'

/** Legacy remote — currently 403; kept only as a documented fallback. */
const REMOTE_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_090628_7052d8a6-a094-4341-a4a2-ad58493a67a9.mp4'

const MAX_CAPTURE_WIDTH = 960
const INTERVAL = 1000 / 30

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function BoomerangVideoBg() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef<HTMLCanvasElement[]>([])
  const lastTimeRef = useRef(-1)
  const capturingRef = useRef(false)
  const captureStartedRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const rvfcHandleRef = useRef<number | null>(null)
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const frameIndexRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)
  const triedRemoteRef = useRef(false)

  const [framesReady, setFramesReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState(VIDEO_SRC)

  useEffect(() => {
    const video = videoRef.current
    if (!video || failed) return

    capturingRef.current = true
    captureStartedRef.current = false
    lastTimeRef.current = -1
    framesRef.current = []
    setFramesReady(false)

    const stopCapture = () => {
      capturingRef.current = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (
        rvfcHandleRef.current !== null &&
        'cancelVideoFrameCallback' in HTMLVideoElement.prototype
      ) {
        video.cancelVideoFrameCallback(rvfcHandleRef.current)
        rvfcHandleRef.current = null
      }
    }

    const captureFrame = () => {
      if (!capturingRef.current) return
      if (video.readyState < 2) return

      const t = video.currentTime
      if (t === lastTimeRef.current) return
      lastTimeRef.current = t

      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) return

      const width = Math.min(MAX_CAPTURE_WIDTH, vw)
      const height = Math.round((vh / vw) * width)

      const frame = document.createElement('canvas')
      frame.width = width
      frame.height = height
      const ctx = frame.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, width, height)
      framesRef.current.push(frame)
    }

    const drawFrame = (frame: HTMLCanvasElement) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = frame.width
      canvas.height = frame.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(frame, 0, 0)
    }

    const startBoomerang = () => {
      const frames = framesRef.current
      if (frames.length === 0) return

      setFramesReady(true)

      if (prefersReducedMotion()) {
        drawFrame(frames[0])
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = frames[0].width
      canvas.height = frames[0].height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      frameIndexRef.current = 0
      directionRef.current = 1

      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
      }

      playbackTimerRef.current = setInterval(() => {
        const list = framesRef.current
        if (list.length === 0) return

        const idx = frameIndexRef.current
        ctx.drawImage(list[idx], 0, 0)

        let next = idx + directionRef.current
        if (next >= list.length - 1) {
          next = list.length - 1
          directionRef.current = -1
        } else if (next <= 0) {
          next = 0
          directionRef.current = 1
        }
        frameIndexRef.current = next
      }, INTERVAL)
    }

    const startCaptureLoop = () => {
      if (captureStartedRef.current || !capturingRef.current) return
      captureStartedRef.current = true

      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        const tick = () => {
          if (!capturingRef.current) return
          captureFrame()
          rvfcHandleRef.current = video.requestVideoFrameCallback(tick)
        }
        rvfcHandleRef.current = video.requestVideoFrameCallback(tick)
      } else {
        const tick = () => {
          if (!capturingRef.current) return
          captureFrame()
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    const onEnded = () => {
      stopCapture()
      startBoomerang()
    }

    const beginPlayback = () => {
      void video.play().catch(() => {})
      startCaptureLoop()
    }

    const onError = () => {
      stopCapture()
      if (!triedRemoteRef.current && src === VIDEO_SRC) {
        triedRemoteRef.current = true
        setSrc(REMOTE_VIDEO_SRC)
        return
      }
      setFailed(true)
    }

    video.addEventListener('loadeddata', beginPlayback)
    video.addEventListener('ended', onEnded)
    video.addEventListener('playing', startCaptureLoop)
    video.addEventListener('error', onError)

    if (video.readyState >= 2) {
      beginPlayback()
    }

    return () => {
      stopCapture()
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
      video.removeEventListener('loadeddata', beginPlayback)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('playing', startCaptureLoop)
      video.removeEventListener('error', onError)
      video.pause()
    }
  }, [failed, src])

  if (failed) {
    return <HeroBackdrop />
  }

  return (
    <div className="absolute inset-0 z-0 scale-[1.15] origin-top overflow-hidden">
      <video
        ref={videoRef}
        key={src}
        src={src}
        muted
        playsInline
        preload="auto"
        crossOrigin={src.startsWith('http') ? 'anonymous' : undefined}
        className="w-full h-full object-cover object-top"
        style={{ display: framesReady ? 'none' : 'block' }}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover object-top"
        style={{ display: framesReady ? 'block' : 'none' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-white/55" />
    </div>
  )
}
