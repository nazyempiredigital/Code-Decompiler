import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, Disc3, Globe2, Instagram, Linkedin, Menu, Mic2, Monitor, Music2, Send, Sparkles, X } from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

const media = {
  hero: '/media/76cced6c3298a85a-IMG_8099.jpeg',
  blueprint: '/media/64f5fa803de7e19b-IMG_8088.jpeg',
  paper: '/media/30f6dc3365155ff2-IMG_8124.jpeg',
  og: '/opengraph.jpg',
};

const navItems = [
  { href: '/services', label: 'Services' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
];

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3" data-testid="link-logo">
      <span className={`grid h-9 w-9 place-items-center rounded-xl border ${dark ? 'border-[#eaae18]/40 bg-[#eaae18]/10' : 'border-[#eaae18]/50 bg-[#eaae18]'}`}>
        <span className={`font-mono text-lg font-bold ${dark ? 'text-[#eaae18]' : 'text-[#24180e]'}`}>N</span>
      </span>
      <span className={`leading-none ${dark ? 'text-[#f4ead8]' : 'text-[#24180e]'}`}>
        <strong className="block font-display text-sm tracking-[.18em]">NAZY <em className="not-italic text-[#eaae18]">EMPIRE</em></strong>
        <small className="mt-1 block font-mono text-[8px] tracking-[.22em] opacity-55">DIGITAL / LAGOS</small>
      </span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const isDark = location === '/' || location === '/music-distribution' || location === '/login' || location === '/signup';
  return (
    <div className={`noise min-h-[100dvh] ${isDark ? 'bg-[#24180e] text-[#f4ead8]' : 'bg-[#f5efe5] text-[#24180e]'}`}>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#24180e]/90 backdrop-blur-lg">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 md:px-8">
          <Logo dark />
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(item => <Link key={item.href} href={item.href} data-testid={`link-nav-${item.label.toLowerCase()}`} className={`rounded-full px-4 py-2 text-sm transition ${location === item.href ? 'bg-[#eaae18] text-[#24180e]' : 'text-[#f4ead8]/65 hover:bg-white/10 hover:text-[#f4ead8]'}`}>{item.label}</Link>)}
            <Link href="/contact" data-testid="link-nav-contact" className="ml-3 rounded-full bg-[#eaae18] px-5 py-2.5 text-sm font-bold text-[#24180e] transition hover:bg-[#f6c942]">Start a project <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
          </nav>
          <button type="button" onClick={() => setOpen(v => !v)} className="rounded-lg border border-white/15 p-2.5 text-[#f4ead8] md:hidden" data-testid="button-mobile-menu">
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
        {open && <div className="border-t border-white/10 bg-[#24180e] px-5 pb-5 md:hidden">
          {[...navItems, { href: '/contact', label: 'Start a project' }].map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`} className="block border-b border-white/10 py-4 text-sm text-[#f4ead8]/80">{item.label}<ArrowRight className="float-right h-4 w-4 text-[#eaae18]" /></Link>)}
        </div>}
      </header>
      <main className="pt-[76px]">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  return <footer className="border-t border-[#665234]/30 bg-[#24180e] px-5 py-16 text-[#f4ead8] md:px-8">
    <div className="mx-auto max-w-[1240px]">
      <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
        <div><Logo dark /><p className="mt-6 max-w-xs text-sm leading-6 text-[#f4ead8]/55">Digital infrastructure for people building something worth remembering.</p><div className="mt-6 flex gap-2"><a href="https://instagram.com" target="_blank" rel="noreferrer" className="rounded-full border border-white/15 p-2.5 hover:border-[#eaae18]" data-testid="link-instagram"><Instagram size={16} /></a><a href="https://linkedin.com" target="_blank" rel="noreferrer" className="rounded-full border border-white/15 p-2.5 hover:border-[#eaae18]" data-testid="link-linkedin"><Linkedin size={16} /></a></div></div>
        <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#eaae18]">Explore</p><div className="mt-5 grid gap-3 text-sm text-[#f4ead8]/60"><Link href="/services" data-testid="link-footer-services">Services</Link><Link href="/portfolio" data-testid="link-footer-portfolio">Selected work</Link><Link href="/about" data-testid="link-footer-about">Our story</Link><Link href="/affiliate" data-testid="link-footer-affiliate">Affiliate programme</Link></div></div>
        <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#eaae18]">For artists</p><div className="mt-5 grid gap-3 text-sm text-[#f4ead8]/60"><Link href="/music-distribution" data-testid="link-footer-distribution">Music distribution</Link><Link href="/royalty-calculator" data-testid="link-footer-calculator">Royalty calculator</Link><Link href="/apply-artist" data-testid="link-footer-apply">Join the roster</Link><Link href="/domains" data-testid="link-footer-domains">Find a domain</Link></div></div>
        <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#eaae18]">Let's talk</p><p className="mt-5 text-2xl font-display">Your next chapter<br /><span className="text-[#eaae18]">starts here.</span></p><Link href="/contact" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#f4ead8]" data-testid="link-footer-contact">hello@nazyempire.com <ArrowUpRight size={15} /></Link></div>
      </div>
      <div className="mt-16 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-[.14em] text-[#f4ead8]/35 md:flex-row"><span>© 2025 Nazy Empire Digital</span><span>Lagos · Nigeria · The world</span></div>
    </div>
  </footer>;
}

function ButtonLink({ href, children, outline = false }: { href: string; children: ReactNode; outline?: boolean }) {
  return <Link href={href} data-testid={`link-cta-${href.slice(1).replaceAll('/', '-') || 'home'}-${outline ? 'outline' : 'primary'}`} className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition hover:-translate-y-0.5 ${outline ? 'border border-current/25 text-current hover:border-[#eaae18] hover:text-[#eaae18]' : 'bg-[#eaae18] text-[#24180e] hover:bg-[#f6c942]'}`}>{children}</Link>;
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.22em] ${light ? 'text-[#eaae18]' : 'text-[#b26c10]'}`}><span className="h-px w-7 bg-current" />{children}</p>;
}

function Home() {
  return <div>
    <section className="relative isolate overflow-hidden bg-[#24180e] px-5 pb-24 pt-24 text-[#f4ead8] md:px-8 md:pb-32 md:pt-32">
      <div className="absolute -right-32 top-20 -z-10 h-[38rem] w-[38rem] rounded-full border border-[#eaae18]/10" /><div className="absolute -right-16 top-36 -z-10 h-[28rem] w-[28rem] rounded-full border border-[#eaae18]/10" />
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
        <div className="reveal"><Eyebrow light>Africa's creative infrastructure</Eyebrow><h1 className="max-w-3xl font-display text-[clamp(3.25rem,8vw,7.4rem)] font-semibold leading-[.88] tracking-[-.065em]">Build your<br /><span className="text-[#eaae18]">empire</span><br />online.</h1><p className="mt-8 max-w-xl text-lg leading-7 text-[#f4ead8]/60">Websites, releases, domains and the digital systems behind ambitious African creators and businesses.</p><div className="mt-9 flex flex-wrap gap-3"><ButtonLink href="/contact">Start a project <ArrowRight size={16} /></ButtonLink><ButtonLink href="/services" outline>See what we do</ButtonLink></div><div className="mt-12 flex items-center gap-5 font-mono text-[10px] uppercase tracking-[.15em] text-[#f4ead8]/40"><span>Based in Lagos</span><span className="h-1 w-1 rounded-full bg-[#eaae18]" /><span>Built for everywhere</span></div></div>
        <div className="reveal reveal-delay relative aspect-square max-h-[580px] overflow-hidden rounded-[2rem] border border-[#eaae18]/25 bg-[#8e270e]"><img src={media.hero} alt="Nazy Empire artist portrait" className="h-full w-full object-cover mix-blend-screen opacity-80" /><div className="absolute inset-0 bg-gradient-to-t from-[#24180e]/80 via-transparent to-transparent" /><div className="absolute bottom-6 left-6 right-6 flex items-end justify-between"><div><p className="font-mono text-[10px] tracking-[.2em] text-[#eaae18]">NE / 001</p><p className="mt-2 font-display text-2xl">Make your mark.</p></div><span className="grid h-12 w-12 place-items-center rounded-full bg-[#eaae18] text-[#24180e]"><ArrowDownRight size={21} /></span></div></div>
      </div>
    </section>
    <div className="overflow-hidden border-y border-[#665234]/30 bg-[#eaae18] py-3 text-[#24180e]"><div className="marquee flex w-max gap-8 font-mono text-[11px] font-bold uppercase tracking-[.16em]"><span>Strategy that ships</span><span>/</span><span>Code with character</span><span>/</span><span>Music with reach</span><span>/</span><span>Strategy that ships</span><span>/</span><span>Code with character</span><span>/</span><span>Music with reach</span></div></div>
    <section className="bg-[#f5efe5] px-5 py-24 text-[#24180e] md:px-8 md:py-32"><div className="mx-auto max-w-[1240px]"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><Eyebrow>Why Nazy</Eyebrow><p className="font-display text-4xl leading-tight md:text-5xl">You bring the <span className="text-[#b26c10]">vision.</span><br />We build the room for it.</p></div><div><p className="max-w-2xl text-xl leading-8 text-[#24180e]/65">We sit at the intersection of culture and technology. That means no jargon for jargon's sake, no template energy, and no disappearing after launch.</p><div className="mt-12 grid gap-8 border-t border-[#665234]/25 pt-8 sm:grid-cols-3"><div><p className="font-display text-4xl">04</p><p className="mt-2 text-sm text-[#24180e]/55">ways to move your work forward</p></div><div><p className="font-display text-4xl">Lagos</p><p className="mt-2 text-sm text-[#24180e]/55">our studio, your global stage</p></div><div><p className="font-display text-4xl">∞</p><p className="mt-2 text-sm text-[#24180e]/55">room for the next idea</p></div></div></div></div></div></section>
    <section className="bg-[#eae0d1] px-5 py-24 md:px-8 md:py-28"><div className="mx-auto max-w-[1240px]"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><Eyebrow>Our capabilities</Eyebrow><h2 className="font-display text-5xl tracking-tight md:text-7xl">The useful<br /><span className="text-[#b26c10]">stuff.</span></h2></div><ButtonLink href="/services" outline>All services <ArrowRight size={16} /></ButtonLink></div><div className="mt-14 grid gap-3 md:grid-cols-2">{[{icon: Monitor, n:'01', title:'Web & app development', copy:'A digital home that looks like you and works hard behind the scenes.', href:'/web-development'}, {icon: Music2, n:'02', title:'Music distribution', copy:'Get your sound where the world is listening, without losing the plot.', href:'/music-distribution'}, {icon: Globe2, n:'03', title:'Domains & hosting', copy:'Fast, reliable foundations. Your corner of the internet, properly claimed.', href:'/domains'}, {icon: Mic2, n:'04', title:'Artist services', copy:'Practical direction for artists ready to turn momentum into a career.', href:'/apply-artist'}].map(({icon:Icon,n,title,copy,href}) => <Link href={href} key={n} className="group flex items-center justify-between gap-5 border-t border-[#665234]/30 py-7 transition hover:px-3" data-testid={`link-capability-${n}`}><div className="flex items-center gap-5"><span className="font-mono text-xs text-[#b26c10]">{n}</span><Icon className="h-6 w-6 text-[#b26c10]" strokeWidth={1.5} /><div><h3 className="font-display text-2xl">{title}</h3><p className="mt-1 max-w-sm text-sm text-[#24180e]/55">{copy}</p></div></div><ArrowUpRight className="h-5 w-5 transition group-hover:translate-x-1 group-hover:-translate-y-1" /></Link>)}</div></div></section>
    <section className="bg-[#24180e] px-5 py-24 text-[#f4ead8] md:px-8 md:py-32"><div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1fr_.9fr]"><div><Eyebrow light>From the archive</Eyebrow><h2 className="font-display text-5xl leading-[.95] md:text-7xl">Work that<br /><span className="text-[#eaae18]">travels.</span></h2><p className="mt-7 max-w-md text-[#f4ead8]/55">A look at the people and ideas we've helped put into the world.</p><ButtonLink href="/portfolio" outline>Explore selected work <ArrowRight size={16} /></ButtonLink></div><div className="grid grid-cols-2 gap-3"><img src={media.blueprint} alt="Blueprint artist campaign" className="mt-10 aspect-[4/5] w-full rounded-2xl object-cover" /><img src={media.paper} alt="Paper artist campaign" className="aspect-[4/5] w-full rounded-2xl object-cover" /></div></div></section>
    <CtaBand />
  </div>;
}

function PageIntro({ eyebrow, title, copy, dark = false }: { eyebrow: string; title: ReactNode; copy: string; dark?: boolean }) {
  return <section className={`${dark ? 'bg-[#24180e] text-[#f4ead8]' : 'bg-[#f5efe5] text-[#24180e]'} px-5 pb-20 pt-24 md:px-8 md:pb-28 md:pt-28`}><div className="mx-auto max-w-[1240px]"><Eyebrow light={dark}>{eyebrow}</Eyebrow><h1 className="max-w-5xl font-display text-[clamp(3.1rem,7vw,7rem)] font-semibold leading-[.9] tracking-[-.06em]">{title}</h1><p className={`mt-8 max-w-2xl text-lg leading-7 ${dark ? 'text-[#f4ead8]/60' : 'text-[#24180e]/60'}`}>{copy}</p></div></section>;
}

const serviceData = [
  { icon: Code2, title: 'Web development', tag: '01 / Build', copy: 'A digital home with a point of view. We design and develop websites and apps that make your work easier to find, trust and buy.', href: '/web-development', color: 'bg-[#eaae18]' },
  { icon: Disc3, title: 'Music distribution', tag: '02 / Release', copy: 'From upload to payout, we get your music into the platforms that matter while keeping your release strategy human.', href: '/music-distribution', color: 'bg-[#d9c2ad]' },
  { icon: Globe2, title: 'Domains & hosting', tag: '03 / Foundation', copy: 'Claim your name. Keep it fast. We handle domains, hosting, SSL and the little technical things that should never become big problems.', href: '/domains', color: 'bg-[#b6c8ae]' },
  { icon: Sparkles, title: 'Artist services', tag: '04 / Direction', copy: 'Release planning, digital presence and honest guidance for artists making the leap from promising to prepared.', href: '/apply-artist', color: 'bg-[#c97955]' },
];

function Services() {
  return <><PageIntro eyebrow="What we do" title={<>A small team.<br /><span className="text-[#b26c10]">A wide toolkit.</span></>} copy="We make the digital parts of your ambition feel less complicated — and much more like you." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-[1240px] space-y-3">{serviceData.map(({icon:Icon,title,tag,copy,href,color}) => <Link href={href} key={title} className={`group grid gap-8 rounded-3xl p-7 transition hover:-translate-y-1 md:grid-cols-[120px_1fr_1.3fr_40px] md:items-center md:p-10 ${color}`} data-testid={`card-service-${title.toLowerCase().replaceAll(' ','-')}`}><span className="font-mono text-xs text-[#24180e]/55">{tag}</span><div className="flex items-center gap-4"><Icon size={29} strokeWidth={1.5} /><h2 className="font-display text-3xl md:text-4xl">{title}</h2></div><p className="max-w-lg text-sm leading-6 text-[#24180e]/65">{copy}</p><ArrowUpRight className="h-6 w-6 transition group-hover:translate-x-1 group-hover:-translate-y-1" /></Link>)}</div></section><section className="bg-[#f5efe5] px-5 py-24 md:px-8"><div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-8 md:flex-row md:items-end"><div><Eyebrow>Not sure where to start?</Eyebrow><h2 className="max-w-2xl font-display text-4xl md:text-6xl">Tell us the messy<br />version.</h2></div><ButtonLink href="/contact">Book a free intro <ArrowRight size={16} /></ButtonLink></div></section></>;
}

function DetailPage({ type }: { type: 'web' | 'music' | 'domains' }) {
  const isWeb = type === 'web'; const isMusic = type === 'music';
  const title = isWeb ? <>Digital presence<br /><span className="text-[#eaae18]">with a pulse.</span></> : isMusic ? <>Put your music<br /><span className="text-[#eaae18]">in the room.</span></> : <>Own your name.<br /><span className="text-[#b6c8ae]">Keep it close.</span></>;
  const copy = isWeb ? 'Strategy, design and development for websites and apps that turn curious visitors into committed people.' : isMusic ? 'Distribution should be the beginning of your release story, not the end of it. We make the admin lighter so you can make the music louder.' : 'Simple domains and serious hosting for artists, founders and teams who are building for the long haul.';
  const features = isWeb ? ['Brand and digital strategy', 'Websites that convert without shouting', 'Custom builds with easy handoff', 'Care after your launch'] : isMusic ? ['Global DSP distribution', 'Release planning and metadata', 'Transparent royalty reporting', 'Playlist and campaign guidance'] : ['.com, .ng and more extensions', 'Fast SSD hosting and SSL', 'Business email setup', 'Human support in plain language'];
  return <><PageIntro eyebrow={isWeb ? '01 / Build' : isMusic ? '02 / Release' : '03 / Foundation'} title={title} copy={copy} dark={isMusic} /><section className={`${isMusic ? 'bg-[#332317] text-[#f4ead8]' : 'bg-[#eae0d1] text-[#24180e]'} px-5 py-20 md:px-8 md:py-28`}><div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[.9fr_1.1fr]"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] opacity-45">The short version</p><h2 className="mt-5 max-w-lg font-display text-4xl leading-tight md:text-6xl">{isWeb ? 'Good tech should feel like a creative advantage.' : isMusic ? 'Your release deserves more than a file upload.' : 'A foundation you never have to think about.'}</h2><ButtonLink href={isMusic ? '/apply-artist' : '/contact'} outline>{isMusic ? 'Apply for artist support' : 'Start a conversation'} <ArrowRight size={16} /></ButtonLink></div><div><div className="border-t border-current/20">{features.map((feature,i) => <div key={feature} className="flex items-center gap-5 border-b border-current/20 py-6"><span className="font-mono text-xs opacity-45">0{i+1}</span><Check className="h-5 w-5 text-[#eaae18]" /><span className="text-lg">{feature}</span></div>)}</div></div></div></section>{isMusic && <section className="bg-[#f5efe5] px-5 py-24 text-[#24180e] md:px-8"><div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-3"><Metric value="150+" label="platforms reached" /><Metric value="7–14" label="days to live" /><Metric value="100%" label="you keep your rights" /></div></section>}<CtaBand /></>;
}

function Metric({ value, label }: { value:string; label:string }) { return <div className="border-l-2 border-[#eaae18] pl-5"><p className="font-display text-5xl">{value}</p><p className="mt-2 text-sm text-[#24180e]/55">{label}</p></div>; }

function Domains() {
  const [query, setQuery] = useState(''); const [searched, setSearched] = useState(false);
  return <><PageIntro eyebrow="03 / Foundation" title={<>Your name,<br /><span className="text-[#b26c10]">on the internet.</span></>} copy="The right domain makes your idea easier to remember. Search for yours, then we'll help you give it a proper home." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-[900px]"><div className="rounded-3xl bg-[#24180e] p-6 text-[#f4ead8] md:p-12"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#eaae18]">Domain finder</p><div className="mt-7 flex flex-col gap-3 sm:flex-row"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')setSearched(true)}} placeholder="yourname" className="min-h-14 flex-1 rounded-xl border border-white/15 bg-white/5 px-5 text-lg outline-none placeholder:text-white/25 focus:border-[#eaae18]" data-testid="input-domain-search" /><button type="button" onClick={()=>setSearched(true)} className="rounded-xl bg-[#eaae18] px-7 font-bold text-[#24180e]" data-testid="button-domain-search">Search domains</button></div>{searched && <div className="mt-5 rounded-xl border border-[#eaae18]/35 bg-[#eaae18]/10 p-4 text-sm"><span className="text-[#eaae18]">{query || 'yourname'}.com</span> is available to enquire about. <Link href="/contact" className="ml-2 underline" data-testid="link-domain-enquire">Enquire now</Link></div>}<p className="mt-5 text-xs text-white/40">We support .com, .ng, .co, .africa and the names that make sense for your brand.</p></div><div className="mt-16 grid gap-4 md:grid-cols-3">{['Fast by default','Secure from day one','Human when needed'].map((x,i)=><div key={x} className="rounded-2xl border border-[#665234]/25 p-6"><span className="font-mono text-xs text-[#b26c10]">0{i+1}</span><h3 className="mt-8 font-display text-2xl">{x}</h3><p className="mt-3 text-sm leading-6 text-[#24180e]/55">{['Reliable hosting with room to grow.','SSL, backups and sensible guardrails.','No ticket maze. Just a clear answer.'][i]}</p></div>)}</div></div></section><CtaBand /></>;
}

function Portfolio() {
  return <><PageIntro eyebrow="Selected work" title={<>Proof over<br /><span className="text-[#b26c10]">promises.</span></>} copy="A few releases, platforms and digital homes from the Nazy Empire archive." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-[1240px]"><div className="grid gap-5 md:grid-cols-12"><Project image={media.blueprint} title="Blueprint" label="Artist identity · Digital campaign" className="md:col-span-7" /><Project image={media.paper} title="Blaqsol" label="Release world · Artist services" className="md:col-span-5 md:mt-20" /><Project image={media.hero} title="The next era" label="Creative systems · In progress" className="md:col-span-5" /><div className="flex min-h-[300px] flex-col justify-between rounded-3xl bg-[#eaae18] p-8 md:col-span-7 md:min-h-[400px]"><Sparkles className="h-8 w-8" /><p className="max-w-md font-display text-4xl leading-tight">Your project could be the next thing we put in the archive.</p><ButtonLink href="/contact" outline>Make an enquiry <ArrowRight size={16} /></ButtonLink></div></div></div></section></>;
}
function Project({ image, title, label, className }: {image:string; title:string; label:string; className?:string}) { return <div className={`group ${className}`}><div className="relative aspect-[1.25] overflow-hidden rounded-3xl"><img src={image} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#24180e]/75 to-transparent" /><div className="absolute bottom-6 left-6 text-[#f4ead8]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#eaae18]">{label}</p><h3 className="mt-2 font-display text-4xl">{title}</h3></div></div></div>; }

function About() {
  return <><PageIntro eyebrow="Our story" title={<>Built in Lagos.<br /><span className="text-[#b26c10]">Open to the world.</span></>} copy="Nazy Empire Digital is a Nigerian digital agency and music technology company for people with somewhere to go." /><section className="bg-[#eae0d1] px-5 py-24 md:px-8 md:py-32"><div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[1fr_1fr]"><div><img src={media.paper} alt="Artist campaign artwork" className="aspect-square w-full rounded-3xl object-cover" /></div><div className="flex flex-col justify-center"><Eyebrow>The belief</Eyebrow><h2 className="font-display text-4xl leading-tight md:text-6xl">African creativity is not a niche. It is a <span className="text-[#b26c10]">signal.</span></h2><p className="mt-7 max-w-lg text-lg leading-8 text-[#24180e]/60">We built Nazy Empire because the people making the most interesting things deserve digital partners who understand both the ambition and the context. Our job is to make the technical feel possible — then make it feel yours.</p><div className="mt-10 grid grid-cols-2 gap-5 border-t border-[#665234]/25 pt-6"><Metric value="01" label="clear thinking" /><Metric value="∞" label="curiosity" /></div></div></div></section><section className="bg-[#24180e] px-5 py-24 text-[#f4ead8] md:px-8 md:py-32"><div className="mx-auto max-w-[1240px]"><Eyebrow light>How we work</Eyebrow><div className="grid gap-10 md:grid-cols-3">{['Listen properly','Make it useful','Leave it better'].map((item,i)=><div key={item} className="border-t border-white/15 pt-6"><span className="font-mono text-xs text-[#eaae18]">0{i+1}</span><h3 className="mt-8 font-display text-3xl">{item}</h3><p className="mt-4 text-sm leading-6 text-white/50">{['We start with your real context, not a pre-filled brief.','Every decision should make the next decision easier.','We build for handover, growth and the version after launch.'][i]}</p></div>)}</div></div></section><CtaBand /></>;
}

function CtaBand() { return <section className="bg-[#eaae18] px-5 py-20 text-[#24180e] md:px-8 md:py-24"><div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-8 md:flex-row md:items-end"><h2 className="max-w-2xl font-display text-5xl leading-[.95] md:text-7xl">Have a good<br />idea? <span className="italic">Good.</span></h2><ButtonLink href="/contact" outline>Let's talk <ArrowUpRight size={17} /></ButtonLink></div></section>; }

function Contact() {
  const [sent,setSent] = useState(false);
  return <><PageIntro eyebrow="Start here" title={<>Let's make<br /><span className="text-[#b26c10]">something real.</span></>} copy="Give us the honest version of what you're working on. We will read it, think about it, and reply with a useful next step." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[.7fr_1.3fr]"><div><p className="font-display text-3xl">hello@nazyempire.com</p><p className="mt-4 text-sm leading-6 text-[#24180e]/55">For projects, partnerships or a quick hello. We are in Lagos (WAT) and work across time zones.</p><div className="mt-10 border-t border-[#665234]/25 pt-5"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#b26c10]">Typical reply</p><p className="mt-2 text-sm">Within 2 working days</p></div></div><div className="rounded-3xl bg-[#f5efe5] p-6 md:p-10">{sent ? <Success title="Message saved locally." copy="Thanks for the context. This demo does not send email, but your next move is clear: hello@nazyempire.com." /> : <form onSubmit={e=>{e.preventDefault();setSent(true)}} className="grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Your name" name="name" required /><Field label="Email address" name="email" type="email" required /></div><label className="grid gap-2 text-sm font-semibold">What are we working on?<select className="h-13 rounded-xl border border-[#665234]/25 bg-transparent px-4 outline-none focus:border-[#b26c10]" data-testid="select-project-type"><option>Website or app</option><option>Music distribution</option><option>Domain and hosting</option><option>Artist services</option><option>Something else</option></select></label><label className="grid gap-2 text-sm font-semibold">Tell us the good stuff<textarea required rows={5} placeholder="What are you building, and what would make this feel like a win?" className="rounded-xl border border-[#665234]/25 bg-transparent p-4 outline-none focus:border-[#b26c10]" data-testid="textarea-project-details" /></label><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#24180e] px-6 py-4 text-sm font-bold text-[#f4ead8] transition hover:bg-[#b26c10]" data-testid="button-send-message">Send the brief <Send size={15} /></button></form>}</div></div></section></>;
}
function Field({label,name,type='text',required=false}:{label:string;name:string;type?:string;required?:boolean}) { return <label className="grid gap-2 text-sm font-semibold">{label}<input name={name} type={type} required={required} className="h-13 rounded-xl border border-[#665234]/25 bg-transparent px-4 outline-none focus:border-[#b26c10]" data-testid={`input-${name}`} /></label>; }
function Success({title,copy}:{title:string;copy:string}) { return <div className="grid min-h-[300px] place-content-center text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#b6c8ae]"><Check /></span><h3 className="mt-6 font-display text-3xl">{title}</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#24180e]/55">{copy}</p><Link href="/" className="mt-6 text-sm font-bold underline" data-testid="link-success-home">Back to home</Link></div>; }

function Faq() {
  const [active,setActive] = useState<number | null>(null); const qs = [['What does a typical project cost?','It depends on the shape of the work. After a first conversation, we share a clear scope and range before anything begins. No mystery invoices.'],['Do you work with clients outside Nigeria?','Yes. We are Lagos-based and work with people across Africa and around the world. Our process is remote-friendly and time-zone aware.'],['Can I manage my website after launch?','Absolutely. We build with handover in mind and can give you a simple editing workflow, ongoing care or both.'],['How long does music distribution take?','Once your metadata and assets are ready, most releases go live across platforms in 7–14 days. Earlier is better for a strategic release.'],['Do you offer payment plans?','For larger builds, yes. We agree milestones upfront so the payment rhythm is as clear as the build.']];
  return <><PageIntro eyebrow="Questions, answered" title={<>No smoke.<br /><span className="text-[#b26c10]">Just clarity.</span></>} copy="The quick answers. If your question is not here, ask it directly." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto max-w-[900px] border-t border-[#665234]/25">{qs.map(([q,a],i)=><div key={q} className="border-b border-[#665234]/25"><button type="button" onClick={()=>setActive(active===i?null:i)} className="flex w-full items-center justify-between gap-5 py-7 text-left font-display text-xl md:text-2xl" data-testid={`button-faq-${i}`}><span>{q}</span><ChevronDown className={`shrink-0 transition ${active===i?'rotate-180 text-[#b26c10]':''}`} /></button>{active===i && <p className="max-w-2xl pb-7 text-sm leading-7 text-[#24180e]/60">{a}</p>}</div>)}</div></section><CtaBand /></>;
}

function Affiliate() {
  const [sent,setSent] = useState(false);
  return <><PageIntro eyebrow="Affiliate programme" title={<>Bring good people.<br /><span className="text-[#b26c10]">Get good value.</span></>} copy="Know an artist, founder or team who needs a better digital foundation? Send them our way and earn when the project starts." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto grid max-w-[1240px] gap-5 md:grid-cols-3">{[['01','Share your link','Tell your network about Nazy Empire and what we do.'],['02','We do the work','We take care of the conversation, scope and delivery.'],['03','You get rewarded','Receive a thank-you fee when a referred project starts.']].map(([n,t,c])=><div key={n} className="rounded-3xl bg-[#24180e] p-7 text-[#f4ead8]"><span className="font-mono text-xs text-[#eaae18]">{n}</span><h2 className="mt-14 font-display text-3xl">{t}</h2><p className="mt-4 text-sm leading-6 text-white/50">{c}</p></div>)}</div><div className="mx-auto mt-16 max-w-[700px] rounded-3xl bg-[#f5efe5] p-6 md:p-10">{sent ? <Success title="You're on the list." copy="This demo records success locally. We would follow up at the email you supplied." /> : <form onSubmit={e=>{e.preventDefault();setSent(true)}} className="grid gap-5"><h2 className="font-display text-3xl">Become a referrer</h2><Field label="Your name" name="affiliate-name" required /><Field label="Email address" name="affiliate-email" type="email" required /><Field label="Who do you want to refer?" name="affiliate-referral" /><button type="submit" className="rounded-full bg-[#eaae18] px-6 py-4 text-sm font-bold" data-testid="button-join-affiliate">Join the programme <ArrowRight className="ml-1 inline h-4 w-4" /></button></form>}</div></section></>;
}

function RoyaltyCalculator() {
  const [streams,setStreams] = useState('25000'); const [rate,setRate] = useState('0.004'); const [split,setSplit] = useState('100');
  const estimate = useMemo(()=>Number(streams||0)*Number(rate||0)*(Number(split||0)/100),[streams,rate,split]);
  return <><PageIntro eyebrow="Artist tool" title={<>Know your<br /><span className="text-[#b26c10]">numbers.</span></>} copy="A simple planning estimate for your next release. Actual royalties vary by platform, territory and deal." /><section className="bg-[#eae0d1] px-5 py-20 md:px-8 md:py-28"><div className="mx-auto grid max-w-[1100px] gap-5 lg:grid-cols-[1fr_.8fr]"><div className="rounded-3xl bg-[#f5efe5] p-6 md:p-10"><div className="grid gap-6"><CalcField label="Estimated streams" value={streams} setValue={setStreams} prefix="#" test="streams" /><CalcField label="Average payout per stream (USD)" value={rate} setValue={setRate} prefix="$" step="0.0001" test="rate" /><CalcField label="Your share of royalties" value={split} setValue={setSplit} suffix="%" test="split" /></div><div className="mt-8 border-t border-[#665234]/25 pt-5 text-xs leading-5 text-[#24180e]/50">Planning estimate only. Platform rates are not fixed and this does not account for taxes, distributor fees, co-writers or publishing.</div></div><div className="flex flex-col justify-between rounded-3xl bg-[#24180e] p-7 text-[#f4ead8] md:p-10"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#eaae18]">Estimated artist royalties</p><p className="mt-8 break-all font-display text-6xl tracking-[-.05em] text-[#eaae18]">${estimate.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="mt-3 text-sm text-white/45">based on your inputs</p></div><ButtonLink href="/apply-artist" outline>Plan your release <ArrowRight size={16} /></ButtonLink></div></div></section></>;
}
function CalcField({label,value,setValue,prefix,suffix,step='1',test}:{label:string;value:string;setValue:(v:string)=>void;prefix?:string;suffix?:string;step?:string;test:string}) { return <label className="grid gap-2 text-sm font-semibold">{label}<div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b26c10]">{prefix}</span><input type="number" min="0" step={step} value={value} onChange={e=>setValue(e.target.value)} className={`h-14 w-full rounded-xl border border-[#665234]/25 bg-transparent ${prefix?'pl-9':'pl-4'} ${suffix?'pr-10':'pr-4'} outline-none focus:border-[#b26c10]`} data-testid={`input-calc-${test}`} />{suffix&&<span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b26c10]">{suffix}</span>}</div></label>; }

function ApplyArtist() {
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageIntro
        eyebrow="Artist services"
        title={<>Make the music.<br /><span className="text-[#eaae18]">We'll mind the map.</span></>}
        copy="Tell us what you are releasing, where you want to go and what is getting in the way. This is the first step, not a commitment."
        dark
      />
      <section className="bg-[#332317] px-5 py-20 text-[#f4ead8] md:px-8 md:py-28">
        <div className="mx-auto max-w-[800px] rounded-3xl border border-white/10 bg-white/[.03] p-6 md:p-10">
          {sent ? <Success title="Application saved locally." copy="Your story matters. In the real service, our team would review it and follow up. For this demo, nothing has been sent." /> : (
            <form onSubmit={e => { e.preventDefault(); setSent(true); }} className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Artist / stage name" name="artist-name" required />
                <Field label="Email address" name="artist-email" type="email" required />
              </div>
              <Field label="Where can we hear you?" name="artist-link" />
              <label className="grid gap-2 text-sm font-semibold">What do you need most?
                <select className="h-13 rounded-xl border border-white/15 bg-transparent px-4 outline-none focus:border-[#eaae18]" data-testid="select-artist-need">
                  <option className="text-[#24180e]">A release plan</option><option className="text-[#24180e]">Distribution</option><option className="text-[#24180e]">Digital presence</option><option className="text-[#24180e]">A little of everything</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">Tell us about the next release
                <textarea required rows={5} className="rounded-xl border border-white/15 bg-transparent p-4 outline-none focus:border-[#eaae18]" data-testid="textarea-artist-story" />
              </label>
              <button type="submit" className="rounded-full bg-[#eaae18] px-6 py-4 text-sm font-bold text-[#24180e]" data-testid="button-submit-artist">Send application <ArrowRight className="ml-1 inline h-4 w-4" /></button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

function Auth({ mode }: { mode: 'login'|'signup' }) {
  const [sent,setSent] = useState(false); const signup = mode === 'signup';
  return <div className="grid min-h-[calc(100dvh-76px)] lg:grid-cols-[.8fr_1.2fr]"><div className="hidden overflow-hidden lg:block"><img src={signup ? media.blueprint : media.hero} alt="" className="h-full w-full object-cover opacity-75" /><div className="absolute left-12 top-32 max-w-sm text-[#f4ead8]"><p className="font-mono text-xs uppercase tracking-[.2em] text-[#eaae18]">Nazy Empire Digital</p><p className="mt-6 font-display text-5xl leading-none">The work<br />continues.</p></div></div><div className="grid place-items-center bg-[#f5efe5] px-5 py-16 text-[#24180e]"><div className="w-full max-w-md">{sent ? <Success title={signup?'Account UI complete.':'Sign-in UI complete.'} copy="No authentication service was included in the source archive. This screen is a polished, local-only preview." /> : <><Logo /><p className="mt-14 font-mono text-[10px] uppercase tracking-[.2em] text-[#b26c10]">UI-only preview</p><h1 className="mt-4 font-display text-5xl">{signup?'Create your account.':'Welcome back.'}</h1><p className="mt-4 text-sm leading-6 text-[#24180e]/55">This is the front end of the experience. No credentials will be sent or stored.</p><form onSubmit={e=>{e.preventDefault();setSent(true)}} className="mt-9 grid gap-5">{signup&&<Field label="Your name" name="auth-name" required />}<Field label="Email address" name="auth-email" type="email" required /><Field label="Password" name="auth-password" type="password" required /><button type="submit" className="rounded-full bg-[#24180e] px-6 py-4 text-sm font-bold text-[#f4ead8]" data-testid={`button-${mode}`}>{signup?'Create account':'Sign in'} <ArrowRight className="ml-1 inline h-4 w-4" /></button></form><p className="mt-7 text-center text-sm text-[#24180e]/55">{signup?'Already have an account?':'New to Nazy Empire?'} <Link href={signup?'/login':'/signup'} className="font-bold text-[#b26c10] underline" data-testid="link-auth-switch">{signup?'Sign in':'Create one'}</Link></p></>}</div></div></div>;
}

function NotFound() { return <section className="grid min-h-[65vh] place-items-center bg-[#f5efe5] px-5 text-center text-[#24180e]"><div><p className="font-mono text-xs uppercase tracking-[.2em] text-[#b26c10]">404 / not found</p><h1 className="mt-5 font-display text-7xl">Wrong turn.</h1><p className="mx-auto mt-5 max-w-md text-[#24180e]/55">That page does not exist, but your next move can still be a good one.</p><ButtonLink href="/" >Back home <ArrowRight size={16} /></ButtonLink></div></section>; }

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={Home} /><Route path="/services" component={Services} /><Route path="/web-development"><DetailPage type="web" /></Route><Route path="/music-distribution"><DetailPage type="music" /></Route><Route path="/domains" component={Domains} /><Route path="/portfolio" component={Portfolio} /><Route path="/about" component={About} /><Route path="/contact" component={Contact} /><Route path="/faq" component={Faq} /><Route path="/affiliate" component={Affiliate} /><Route path="/royalty-calculator" component={RoyaltyCalculator} /><Route path="/apply-artist" component={ApplyArtist} /><Route path="/login"><Auth mode="login" /></Route><Route path="/signup"><Auth mode="signup" /></Route><Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Shell><Router /></Shell></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;