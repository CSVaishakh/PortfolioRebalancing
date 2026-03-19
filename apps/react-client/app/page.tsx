export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <span className="font-semibold text-lg tracking-tight">PortfolioIQ</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/auth"
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign In
          </a>
          <a
            href="/auth"
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Privacy-preserving · Federated Learning
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight max-w-4xl mx-auto">
          Rebalance your portfolio
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            with AI you can trust
          </span>
        </h1>

        <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Upload your holdings from any broker. Our federated AI analyses your sector
          allocation and delivers personalised rebalancing recommendations — without
          your data ever leaving your device.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/auth"
            className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-sm transition-colors"
          >
            Start for free →
          </a>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto px-8 py-3.5 border border-zinc-700 hover:border-zinc-500 rounded-xl font-medium text-sm text-zinc-300 transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* Mock dashboard preview */}
        <div className="mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent z-10 pointer-events-none" />
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-left max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-2 text-xs text-zinc-500">portfolio.csv</span>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { label: "Total Holdings", value: "₹4,82,310", change: "+2.3%" },
                { label: "Sectors", value: "6", change: "diversified" },
                { label: "Best Performer", value: "TATASTEEL", change: "+12.4%" },
                { label: "Rebalance Score", value: "74 / 100", change: "good" },
              ].map((stat) => (
                <div key={stat.label} className="bg-zinc-800/60 rounded-lg p-3">
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                  <p className="text-sm font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-emerald-400 mt-0.5">{stat.change}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { symbol: "SBIN", sector: "FINANCIAL SERVICES", weight: 28, color: "bg-blue-500" },
                { symbol: "TATASTEEL", sector: "METALS", weight: 42, color: "bg-orange-500" },
                { symbol: "INFY", sector: "IT", weight: 18, color: "bg-indigo-500" },
                { symbol: "RELIANCE", sector: "ENERGY", weight: 12, color: "bg-yellow-500" },
              ].map((row) => (
                <div key={row.symbol} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-300 w-20">{row.symbol}</span>
                  <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${row.color} rounded-full`}
                      style={{ width: `${row.weight}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-400 w-8 text-right">{row.weight}%</span>
                  <span className="text-xs text-zinc-500 w-32 hidden sm:block">{row.sector}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-center text-3xl font-bold mb-3">Everything you need to rebalance smarter</h2>
        <p className="text-center text-zinc-400 mb-12">
          No spreadsheets. No guesswork. Just upload and act.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: "⬆",
              title: "Universal file import",
              body: "Upload exports from Zerodha, Groww, Angel One, ICICI Direct and more. CSV and Excel supported. Our parser auto-maps columns regardless of broker format.",
            },
            {
              icon: "🔒",
              title: "Federated privacy",
              body: "Your portfolio never leaves your browser. The AI model trains locally on your device and only contributes anonymised weight updates to the global model.",
            },
            {
              icon: "⚖",
              title: "Sector rebalancing",
              body: "Instantly see your allocation across IT, Financials, Metals, Energy and more. Get AI-driven suggestions to bring your portfolio to target weights.",
            },
            {
              icon: "📈",
              title: "P&L at a glance",
              body: "Unrealised gains, sector exposure, and top/bottom performers — all derived from your uploaded data in seconds.",
            },
            {
              icon: "🤖",
              title: "Collaborative AI",
              body: "The more users train the model, the smarter it gets for everyone — without any single user's data being shared. Federated averaging in action.",
            },
            {
              icon: "🔄",
              title: "One-click refresh",
              body: "Re-upload your portfolio anytime to get updated recommendations. Your personal model weights are saved so retraining is fast.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-center text-3xl font-bold mb-3">How it works</h2>
        <p className="text-center text-zinc-400 mb-12">Three steps from upload to action</p>
        <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            {
              step: "01",
              title: "Upload your holdings",
              body: "Export your portfolio from your broker and drop the CSV or Excel file. We handle any column format automatically.",
            },
            {
              step: "02",
              title: "AI trains locally",
              body: "The logistic regression model fits to your holdings right in your browser. Nothing is sent to our servers — only model weights.",
            },
            {
              step: "03",
              title: "Get recommendations",
              body: "See which sectors are overweight or underweight and receive specific buy/sell suggestions to rebalance your portfolio.",
            },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-sm mx-auto mb-4">
                {s.step}
              </div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 to-violet-950/40 p-12 text-center">
          <h2 className="text-3xl font-bold mb-3">Ready to rebalance?</h2>
          <p className="text-zinc-400 mb-8 max-w-md mx-auto">
            Create a free account and upload your portfolio in under a minute.
          </p>
          <a
            href="/auth"
            className="inline-block px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-sm transition-colors"
          >
            Get started free →
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
              P
            </div>
            <span>PortfolioIQ</span>
          </div>
          <p>© {new Date().getFullYear()} PortfolioIQ. Built with federated learning.</p>
        </div>
      </footer>
    </div>
  );
}
