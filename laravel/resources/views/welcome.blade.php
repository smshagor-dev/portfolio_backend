<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#080e1c">
    <meta name="description" content="Portfolio API developer console: health, endpoints and MongoDB connectivity.">
    <title>Portfolio API — Developer Console</title>
    <style>
        :root { color-scheme:dark; --bg:#080e1c; --panel:#111b2e; --line:#28354e; --text:#f3f7ff; --muted:#9baecb; --cyan:#60e5e0; --violet:#a9a0ff; --green:#67e8ac; --red:#ff9aab; }
        * { box-sizing:border-box; }
        html { scroll-behavior:smooth; }
        body { margin:0; min-height:100vh; background:var(--bg); color:var(--text); font:15px/1.65 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        body::before { content:""; position:fixed; z-index:-2; inset:0; background:radial-gradient(ellipse 55% 42% at 84% 10%,#304e9850,transparent 75%),radial-gradient(ellipse 40% 35% at 4% 54%,#235b6750,transparent 85%),linear-gradient(175deg,#080e1c,#0b1324 72%,#090e1c); }
        body::after { content:""; position:fixed; z-index:-1; inset:0; background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px); background-size:60px 60px; mask-image:linear-gradient(to bottom,#0007,transparent 85%); pointer-events:none; }
        a { color:inherit; text-decoration:none; }
        button { font:inherit; cursor:pointer; }
        button:focus-visible,a:focus-visible { outline:2px solid var(--cyan); outline-offset:4px; }
        .wrap { width:min(1160px,calc(100% - 48px)); margin:auto; }
        .nav { border-bottom:1px solid #ffffff15; }
        .nav .wrap { min-height:84px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
        .brand { display:flex; align-items:center; gap:13px; font-size:16px; font-weight:750; letter-spacing:-.02em; }
        .brand-mark { width:41px; height:41px; display:grid; place-items:center; border-radius:12px; color:#071522; font-weight:900; font-size:19px; background:linear-gradient(140deg,var(--cyan),#75a8ff); box-shadow:0 0 30px #60e5e02e; }
        .nav-right { display:flex; align-items:center; gap:22px; color:var(--muted); font-size:13px; }
        .nav-right a:hover,.inline-link:hover { color:var(--cyan); }
        .pill { display:inline-flex; align-items:center; gap:9px; padding:7px 12px; border:1px solid #ffffff2a; border-radius:99px; background:#ffffff09; color:#dbe8fa; font:600 12px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .dot { flex:none; width:7px; height:7px; border-radius:50%; background:#e7be6d; box-shadow:0 0 0 4px #e7be6d18; }
        .dot.online { background:var(--green); box-shadow:0 0 0 4px #67e8ac1a; }
        .dot.offline { background:var(--red); box-shadow:0 0 0 4px #ff9aab1a; }
        .hero { display:grid; grid-template-columns:1.03fr .97fr; align-items:center; gap:45px; padding:94px 0 76px; }
        .eyebrow { display:inline-flex; align-items:center; gap:10px; color:var(--cyan); letter-spacing:.18em; font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .eyebrow::before { content:""; width:19px; height:1px; background:var(--cyan); }
        h1 { margin:22px 0 22px; max-width:670px; letter-spacing:-.06em; font-size:clamp(46px,5.3vw,72px); line-height:1.075; font-weight:800; }
        h1 span { background:linear-gradient(100deg,#8bfcf1 5%,#a8b9ff 68%,#d3a8ff); color:transparent; -webkit-background-clip:text; background-clip:text; }
        .lead { margin:0; max-width:500px; color:#aec0da; font-size:17px; line-height:1.85; }
        .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:35px; }
        .btn { display:inline-flex; align-items:center; justify-content:center; gap:10px; padding:12px 20px; border-radius:11px; font-weight:700; font-size:14px; transition:transform .2s,background .2s; }
        .btn:hover { transform:translateY(-2px); }
        .primary { color:#061726; background:linear-gradient(110deg,#69ece1,#8bafff); box-shadow:0 12px 35px #68bcf11e; }
        .secondary { color:#d6e5ff; border:1px solid #ffffff2c; background:#ffffff08; }
        .visual { position:relative; min-height:365px; display:grid; place-items:center; }
        .orb { width:min(100%,420px); aspect-ratio:1; border:1px solid #7cd8ff31; border-radius:50%; position:relative; display:grid; place-items:center; background:radial-gradient(circle at 47% 48%,#5ce6ce2b,transparent 40%),radial-gradient(circle,#405ca332,transparent 66%); box-shadow:0 0 110px #4c87f02a,inset 0 0 90px #4b8eae18; }
        .orb::before,.orb::after { content:""; position:absolute; inset:13%; border:1px dashed #b5b6ff48; border-radius:50%; transform:rotateX(61deg) rotateZ(-20deg); }
        .orb::after { transform:rotateY(58deg) rotateZ(19deg); border-style:solid; border-color:#72dedc40; }
        .core { width:126px; height:126px; border-radius:29px; display:grid; place-items:center; font:800 31px ui-monospace,SFMono-Regular,Consolas,monospace; color:#d0fff5; background:linear-gradient(140deg,#223c55,#151e3b); border:1px solid #73d7e46e; box-shadow:0 20px 70px #0007,inset 0 0 30px #65d9e022; transform:rotate(-9deg); }
        .float { position:absolute; border:1px solid #8fc8ff42; background:#101d32ee; padding:9px 13px; border-radius:9px; font:600 11px ui-monospace,SFMono-Regular,Consolas,monospace; color:#bee0f9; box-shadow:0 14px 38px #0008; }
        .f1 { top:14%; right:-10px; }.f2 { bottom:18%; left:-17px; }.f3 { top:19%; left:1%; }
        .glow { color:var(--green); }
        .section-title { display:flex; justify-content:space-between; align-items:end; gap:12px; margin:0 0 18px; }
        .section-title h2 { margin:0; font-size:24px; letter-spacing:-.035em; line-height:1.3; }
        .section-title p { margin:4px 0 0; color:var(--muted); font-size:13px; }
        .section-title small { color:var(--muted); font:12px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .panel { background:linear-gradient(135deg,#152136e8,#0d182ae8); border:1px solid #ffffff18; border-radius:17px; box-shadow:0 17px 55px #0002; }
        .status-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-bottom:66px; }
        .status-card { min-height:132px; padding:23px 22px; }
        .label { display:flex; align-items:center; gap:9px; color:#9caec8; font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace; letter-spacing:.09em; text-transform:uppercase; }
        .status-card strong { display:block; font-size:21px; margin:17px 0 4px; letter-spacing:-.03em; }
        .status-card span { color:#8da1bd; font-size:12px; }
        .grid-two { display:grid; grid-template-columns:1.1fr .9fr; gap:16px; margin-bottom:78px; }
        .guide { overflow:hidden; }
        .panel-head { padding:21px 23px; border-bottom:1px solid #ffffff17; display:flex; align-items:center; justify-content:space-between; }
        .panel-head h3 { margin:0; font-size:16px; letter-spacing:-.02em; }
        .guide .desc { padding:22px 24px 0; color:#a4b8d4; font-size:14px; margin:0; }
        .terminal { margin:24px; overflow:hidden; background:#070e1a; border:1px solid #30415a; border-radius:11px; }
        .terminal-head { display:flex; align-items:center; justify-content:space-between; padding:11px 13px; border-bottom:1px solid #23364b; background:#0e1828; }
        .circles { display:flex; gap:6px; }.circles i { width:8px; height:8px; display:block; border-radius:50%; background:#fa7070; }.circles i:nth-child(2){background:#f0ce69}.circles i:nth-child(3){background:#65cfa1}
        .terminal-head span { color:#7289a6; font:11px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .copy { border:0; background:#23364b; color:#daeaff; border-radius:6px; padding:5px 10px; font:12px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .copy:hover { background:#34516c; }
        pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; padding:23px 20px; font:13px/1.8 ui-monospace,SFMono-Regular,Consolas,monospace; color:#bfe3fb; }
        .prompt { color:var(--cyan); }
        .endpoints { padding:10px 22px 17px; }
        .endpoint { padding:16px 0; border-bottom:1px solid #ffffff13; display:flex; align-items:center; gap:14px; }
        .endpoint:last-child { border:0; }
        .method { color:#82f6d1; background:#82f6d018; padding:4px 7px; border-radius:5px; font:800 10px ui-monospace,SFMono-Regular,Consolas,monospace; }
        .endpoint a { flex:1; min-width:0; overflow-wrap:anywhere; font:13px ui-monospace,SFMono-Regular,Consolas,monospace; color:#e1eaff; }
        .endpoint a:hover { color:var(--cyan); }
        .endpoint .arrow { color:#718aa5; }
        .note { display:flex; align-items:flex-start; gap:11px; color:#9cb1cc; font-size:13px; padding:18px 21px; margin-top:-45px; margin-bottom:80px; background:#0b1726b5; border:1px solid #264154; border-radius:12px; }
        .note b { color:var(--cyan); }
        footer { padding:24px 0 35px; border-top:1px solid #ffffff17; color:#8194b1; font-size:12px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        @media(max-width:900px){.hero{grid-template-columns:1fr;padding:70px 0 35px;gap:10px}.visual{min-height:280px}.orb{max-width:285px}.core{width:91px;height:91px;font-size:23px}.status-grid{grid-template-columns:1fr 1fr}.grid-two{grid-template-columns:1fr}.note{margin-top:-48px}}
        @media(max-width:600px){.wrap{width:calc(100% - 32px)}.nav .wrap{min-height:72px}.nav-right a{display:none}.hero{padding:56px 0 25px}.lead{font-size:15px}.visual{min-height:260px}.float{font-size:9px}.status-grid{grid-template-columns:1fr}.status-card{min-height:115px;padding:17px 19px}.status-grid{margin-bottom:55px}.section-title h2{font-size:21px}.terminal{margin:15px}.guide .desc{padding:18px}.panel-head{padding:18px}.endpoints{padding:8px 16px}}
        @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn{transition:none}.btn:hover{transform:none}}
    </style>
</head>
<body>
<header class="nav">
    <div class="wrap">
        <a href="/" class="brand" aria-label="Portfolio API home"><span class="brand-mark">P/</span><span>Portfolio <span style="color:#6ce8e3">API</span></span></a>
        <nav class="nav-right" aria-label="Site navigation">
            <a href="#endpoints">Endpoints</a><a href="#quickstart">Quickstart</a>
            <span class="pill" role="status" aria-live="polite"><i class="dot" id="navDot"></i><span id="navState">Checking status</span></span>
        </nav>
    </div>
</header>
<main class="wrap">
    <section class="hero" aria-labelledby="welcome-title">
        <div>
            <div class="eyebrow">DEVELOPER CONSOLE · V1.0</div>
            <h1 id="welcome-title">A smarter backend.<br><span>Built to scale.</span></h1>
            <p class="lead">Your portfolio's Laravel API, powered by MongoDB Atlas. A single place to explore endpoints, inspect connection health and start building with confidence.</p>
            <div class="actions">
                <a href="/api/health" class="btn primary">Check API health <span aria-hidden="true">↗</span></a>
                <a href="#endpoints" class="btn secondary">Explore endpoints <span aria-hidden="true">↓</span></a>
            </div>
        </div>
        <div class="visual" aria-hidden="true">
            <div class="orb"><div class="core">{ API }</div></div>
            <div class="float f1"><span class="glow">●</span> REST endpoints</div>
            <div class="float f2">Laravel 12 / PHP 8.2</div>
            <div class="float f3"><span class="glow">◉</span> MongoDB Atlas</div>
        </div>
    </section>

    <section aria-labelledby="system-title">
        <div class="section-title"><div><h2 id="system-title">System overview</h2><p>Live signals, not simulated uptime or connectivity.</p></div><small id="checkedAt">Last check · pending</small></div>
        <div class="status-grid">
            <div class="panel status-card"><div class="label"><i class="dot online"></i> Web application</div><strong>Online</strong><span>Laravel application responding</span></div>
            <div class="panel status-card"><div class="label"><i class="dot" id="apiDot"></i> API service</div><strong id="apiState">Checking…</strong><span>Live health endpoint</span></div>
            <div class="panel status-card"><div class="label"><i class="dot" id="dbDot"></i> Database</div><strong id="dbState">Checking…</strong><span id="dbDetail">MongoDB Atlas · connection ping</span></div>
        </div>
    </section>

    <section aria-labelledby="tools-title">
        <div class="section-title"><div><h2 id="tools-title">Everything in one place</h2><p>Reference endpoints and a practical first request.</p></div></div>
        <div class="grid-two">
            <div id="quickstart" class="panel guide">
                <div class="panel-head"><h3>Quickstart</h3><span class="pill">HTTP · JSON</span></div>
                <p class="desc">Run the health check below to verify your API and database connection. The response includes the actual connection result and latency.</p>
                <div class="terminal" aria-label="Curl health check example">
                    <div class="terminal-head"><div class="circles"><i></i><i></i><i></i></div><span>terminal</span><button class="copy" id="copyCode" type="button" aria-label="Copy curl command">Copy</button></div>
                    <pre><span class="prompt">$</span> curl -i {{ rtrim(config('app.url'), '/') }}/api/health</pre>
                </div>
                <p class="desc" style="padding-bottom:26px;padding-top:0">Healthy responses return HTTP 200; unavailable MongoDB connections return HTTP 503 without exposing credentials.</p>
            </div>
            <div id="endpoints" class="panel">
                <div class="panel-head"><h3>Explore API</h3><span class="pill">Public routes</span></div>
                <div class="endpoints">
                    <div class="endpoint"><span class="method">GET</span><a href="/api/health">/api/health</a><span class="arrow">↗</span></div>
                    <div class="endpoint"><span class="method">GET</span><a href="/api/site/home">/api/site/home</a><span class="arrow">↗</span></div>
                    <div class="endpoint"><span class="method">GET</span><a href="/api/site/projects/sample-project">/api/site/projects/{slug}</a><span class="arrow">↗</span></div>
                    <div class="endpoint"><span class="method">GET</span><a href="/api/research-publications">/api/research-publications</a><span class="arrow">↗</span></div>
                    <div class="endpoint"><span class="method">GET</span><a href="/api/site/settings">/api/site/settings</a><span class="arrow">↗</span></div>
                </div>
            </div>
        </div>
        <div class="note"><span aria-hidden="true">ⓘ</span><span><b>Built for safer deployments.</b> This welcome page never displays database credentials or connection strings. Admin endpoints require authentication. For new installs, configure <code>DATABASE_URL</code> and <code>MONGODB_DATABASE</code> in the private environment.</span></div>
    </section>
</main>
<footer class="wrap"><span>© {{ date('Y') }} Portfolio API. Crafted for developers.</span><span>Laravel 12 <span style="color:#526883">·</span> PHP 8.2 <span style="color:#526883">·</span> MongoDB</span></footer>
<script>
(function () {
    "use strict";
    var navDot = document.getElementById("navDot"), apiDot = document.getElementById("apiDot"),
        dbDot = document.getElementById("dbDot"), navState = document.getElementById("navState"),
        apiState = document.getElementById("apiState"), dbState = document.getElementById("dbState"),
        dbDetail = document.getElementById("dbDetail"), checkedAt = document.getElementById("checkedAt");
    function status(dot, good) { dot.className = "dot " + (good ? "online" : "offline"); }
    async function refresh() {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 8000);
        try {
            var response = await fetch("/api/health", {cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
            var data = await response.json();
            var healthy = response.ok && data.status === "ok" && data.database === "connected";
            status(navDot, healthy); status(apiDot, response.ok); status(dbDot, healthy);
            navState.textContent = healthy ? "All systems operational" : "Database unavailable";
            apiState.textContent = response.ok ? "Healthy" : "Degraded";
            dbState.textContent = healthy ? "Connected" : "Not connected";
            dbDetail.textContent = healthy ? "MongoDB Atlas · " + (Number(data.latencyMs) || 0) + "ms" : "Check Atlas connection and environment";
        } catch (error) {
            status(navDot,false); status(apiDot,false); status(dbDot,false);
            navState.textContent = "Connection check failed";
            apiState.textContent = "Unavailable"; dbState.textContent = "Unknown";
            dbDetail.textContent = "API health check did not respond";
        } finally {
            clearTimeout(timeout);
            checkedAt.textContent = "Last check · " + new Date().toLocaleTimeString();
        }
    }
    document.getElementById("copyCode").addEventListener("click", function () {
        var button = this;
        var cmd = "curl -i " + window.location.origin + "/api/health";
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(cmd).then(function () {
                button.textContent = "Copied";
                button.setAttribute("aria-label","Command copied");
            }).catch(function () { button.textContent = "Copy unavailable"; });
        } else {
            button.textContent = "Select the command";
        }
    });
    refresh();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
})();
</script>
</body>
</html>
