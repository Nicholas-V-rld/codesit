import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { Platform } from './sections/Platform'
import { AccessControl } from './sections/AccessControl'
import { Security } from './sections/Security'
import { Deploy } from './sections/Deploy'
import { ClosingCta } from './sections/ClosingCta'
import { Footer } from './sections/Footer'

export function App() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Platform />
        <AccessControl />
        <Security />
        <Deploy />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  )
}
