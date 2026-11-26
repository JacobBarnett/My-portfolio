import { useEffect } from "react";
import "./Portfolio.css";

// Every project lives in this repository except the debt tracker, which has
// its own. A "GitHub" link that lands on a profile page makes someone hunt
// for the code and most will not bother, so each one points at the file.
const REPO = "https://github.com/JacobBarnett/My-portfolio";

export default function Portfolio() {
  useEffect(() => {
    const revealEls = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            entry.target.style.transitionDelay = `${i * 0.07}s`;
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="portfolio-wrapper">
      {/* NAV */}
      <nav className="port-nav">
        <div className="nav-logo">JB</div>
        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#skills">Skills</a>
          <a href="#projects">Projects</a>
          <a href="#games">Games</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero-section port-section">
        <div className="hero-inner">
          <span className="hero-tag">Open to full time roles</span>
          <h1 className="hero-h1">
            Jacob
            <br />
            <em>Barnett</em>
          </h1>
          <p className="hero-sub">
            Full Stack Software Engineer. I work on a live production Ruby on
            Rails application for a real client, and I build the rest of what
            is on this page on my own, from a Rust physics engine to a
            business messaging platform with a mobile app.
          </p>
          <div className="hero-cta">
            <a href="#projects" className="btn btn-primary">
              View Projects
            </a>
            <a href="#contact" className="btn btn-outline">
              Get in Touch
            </a>
          </div>
          {/* The simulator was reachable only by clicking through the
              asteroid browser, which nobody does in the minute they spend
              here. It is the best thing on the site, so it gets a door. */}
          <a
            className="hero-feature-link"
            href="/mining"
            target="_blank"
            rel="noreferrer"
          >
            <span className="hero-feature-dot" />
            Fly an asteroid mining mission, run by a Rust engine in your
            browser
            <span className="hero-feature-arrow">→</span>
          </a>
        </div>
        <div className="scroll-indicator">
          <span>Scroll</span>
          <div className="scroll-line"></div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="about-section port-section">
        <div className="about-grid">
          <div className="about-text reveal">
            <span className="section-label">About Me</span>
            <h2 className="section-title">
              Driven by curiosity,
              <br />
              built on craft.
            </h2>
            <p>
              I'm a <strong>Full Stack Software Engineer</strong>, currently
              under contract on a{" "}
              <strong>live production Ruby on Rails application</strong> that
              serves real users, working with the founding team through an
              active rebrand. I built a sandboxed local environment to study
              the legacy codebase safely, audited it and surfaced findings the
              client needed to know about, and I am now rebuilding the
              frontend in React.
            </p>
            <p>
              Before that I taught myself. I started in 2020 out of plain
              curiosity, completed{" "}
              <strong>BloomTech's Full Stack program in 2025</strong>, and in
              between shipped things nobody assigned me: a business messaging
              platform with a React Native companion app, and a physics engine
              in Rust that runs in a browser tab. That is the habit I would
              bring to a team.
            </p>
            <p>
              What I care about most is work that holds up when someone looks
              closely. The asteroid simulator on this page will tell you a
              number is unpublished rather than guess at it, and will tell you
              a mission is impossible rather than fake a result. I would
              rather be <strong>correct and say so plainly</strong> than look
              impressive and be wrong.
            </p>
          </div>
          <div className="about-stats reveal">
            <div className="stat-card">
              <div className="stat-number">5+</div>
              <div className="stat-label">Years Coding</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">2025</div>
              <div className="stat-label">BloomTech Graduate</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">FS</div>
              <div className="stat-label">Full Stack Focus</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">∞</div>
              <div className="stat-label">Curiosity</div>
            </div>
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section id="skills" className="port-section">
        <div className="skills-inner">
          <div className="reveal">
            <span className="section-label">Expertise</span>
            <h2 className="section-title">Skills &amp; Technologies</h2>
          </div>
          <div className="skills-grid">
            <div className="skill-category reveal">
              <div className="skill-cat-title">Frontend</div>
              <div className="skill-tags">
                {[
                  "React",
                  "JavaScript (ES6+)",
                  "HTML5",
                  "CSS3",
                  "Redux",
                  "Tailwind CSS",
                  "Three.js",
                  "Responsive Design",
                ].map((s) => (
                  <span className="skill-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="skill-category reveal">
              <div className="skill-cat-title">Backend</div>
              <div className="skill-tags">
                {[
                  "Node.js",
                  "Express",
                  "Ruby on Rails",
                  "PostgreSQL",
                  "REST APIs",
                  "SQL",
                  "Knex.js",
                  "Authentication / JWT",
                  "Serverless Functions",
                  "API Design",
                ].map((s) => (
                  <span className="skill-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="skill-category reveal">
              <div className="skill-cat-title">Tools &amp; Workflow</div>
              <div className="skill-tags">
                {[
                  "Git & GitHub",
                  "Docker",
                  "VS Code",
                  "Vercel",
                  "Command Line",
                  "Agile / Scrum",
                  "Testing",
                  "Figma",
                  "Performance Optimization",
                ].map((s) => (
                  <span className="skill-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="skill-category reveal">
              <div className="skill-cat-title">Emerging Tech</div>
              <div className="skill-tags">
                {[
                  "Rust",
                  "WebAssembly (WASM)",
                  "Three.js / WebGL",
                  "Real-Time Data",
                  "NASA APIs",
                  "Physics Simulation",
                  "REST API Integration",
                ].map((s) => (
                  <span className="skill-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PROJECTS */}
      <section id="projects" className="projects-section port-section">
        <div className="projects-inner">
          <div className="reveal">
            <span className="section-label">Featured Work</span>
            <h2 className="section-title">Projects</h2>
          </div>
          <div className="projects-grid">
            {/* Tesla UI */}
            <div className="project-card reveal">
              <div className="project-number">01</div>
              <div className="project-tag">React · Spotify API · Dashboard</div>
              <h3 className="project-title">Tesla Car UI</h3>
              <p className="project-desc">
                A fully interactive Tesla-inspired car dashboard with real
                Spotify integration. Control music playback, climate,
                navigation, and vehicle settings — all from a sleek automotive
                UI built in React.
              </p>
              <div className="project-links">
                <a
                  href="/tesla"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch App →
                </a>
                <a
                  href={REPO + "/blob/main/src/TeslaUI.jsx"}
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  Source →
                </a>
              </div>
            </div>

            {/* RoboTaxi Fleet Monitor */}
            <div className="project-card reveal">
              <div className="project-number">02</div>
              <div className="project-tag">
                React · Leaflet · Real-Time Simulation
              </div>
              <h3 className="project-title">RoboTaxi Fleet Monitor</h3>
              <p className="project-desc">
                A live operations dashboard for a simulated fleet of 20
                autonomous Tesla Cybercabs across Los Angeles. Track vehicles in
                real time, monitor passengers, battery levels, and dispatch
                status — all updated live on an interactive map.
              </p>
              <div className="project-links">
                <a
                  href="/robotaxi"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch App →
                </a>
                <a
                  href={REPO + "/blob/main/src/RoboTaxi.jsx"}
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  Source →
                </a>
              </div>
            </div>

            {/* BizWatch Connect */}
            <div className="project-card reveal">
              <div className="project-number">03</div>
              <div className="project-tag">
                React · React Native / Expo · Firebase
              </div>
              <h3 className="project-title">BizWatch Connect</h3>
              <p className="project-desc">
                A business-focused alert and messaging platform connecting
                local businesses for real-time communication, safety alerts,
                and deals — built as a web app with a companion React Native
                mobile app. Features Discord-style group channels, direct
                messaging, and an interactive map for discovering nearby
                businesses on the network.
              </p>
              <div className="project-links">
                <a
                  href="https://bizwatch.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch App →
                </a>
                <a
                  href="https://github.com/JacobBarnett"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  GitHub →
                </a>
              </div>
            </div>

            {/* Asteroid Mining Simulator — the Rust engine */}
            <div className="project-card project-card--featured reveal">
              <div className="project-number">04</div>
              <div className="project-featured-badge">Featured</div>
              <div className="project-tag">
                Rust · WebAssembly · Three.js · NASA JPL
              </div>
              <h3 className="project-title">Asteroid Mining Simulator</h3>
              <p className="project-desc">
                A physics engine written in Rust, compiled to WebAssembly, and
                run entirely in the browser with no backend. It applies the
                Tsiolkovsky rocket equation and Hohmann transfer delta v to
                real near-Earth asteroids, then flies the mission you plan in
                3D, one command at a time, with comm delay scaled to the real
                distance.
              </p>
              <p className="project-desc">
                Pick a target and pick a ship: four real spacecraft with
                published specs, including OSIRIS-REx and Psyche, alongside
                haulers that do not exist and say so. Every figure traces to a
                cited source, an unpublished spec reads as unpublished rather
                than as a guess, and the engine will tell you plainly that no
                spacecraft ever flown could bring a ton of anything home.
              </p>
              <div className="project-links">
                <a
                  href="/mining"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch Simulator →
                </a>
                <a
                  href={REPO + "/tree/main/mining-physics"}
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  Rust engine →
                </a>
              </div>
            </div>

            {/* Asteroid Mining Dashboard */}
            <div className="project-card reveal">
              <div className="project-number">05</div>
              <div className="project-tag">
                React · Three.js · NASA JPL · Serverless
              </div>
              <h3 className="project-title">Asteroid Mining Dashboard</h3>
              <p className="project-desc">
                The target browser that feeds the simulator. It pulls sixty
                real near-Earth asteroids from NASA's JPL Close Approach API
                through a serverless proxy, draws their orbits in 3D, and
                filters them by delta v and diameter. Send a target through and
                it opens in the simulator ready to plan.
              </p>
              <div className="project-links">
                <a
                  href="/asteroids"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch App →
                </a>
                <a
                  href={REPO + "/blob/main/src/AMD.jsx"}
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  Source →
                </a>
              </div>
            </div>

            {/* Debt Settlement Tracker */}
            <div className="project-card reveal">
              <div className="project-number">06</div>
              <div className="project-tag">
                React · TypeScript · PHP / Laravel · Go · MySQL
              </div>
              <h3 className="project-title">Debt Settlement Tracker</h3>
              <p className="project-desc">
                An internal tool for tracking clients through a debt settlement
                program — enrollment, settlement progress, and a projected
                payoff timeline. Deliberately split into three services: a React
                and TypeScript dashboard, a PHP/Laravel CRUD API backed by
                MySQL, and a Go microservice that calculates the payoff
                schedule. The live demo runs the real Go projection service as a
                serverless function, with sample client data in the browser.
              </p>
              <div className="project-links">
                <a
                  href="/debt-tracker/"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link project-link--primary"
                >
                  Launch Demo →
                </a>
                <a
                  href="https://github.com/JacobBarnett/debt-settlement-tracker"
                  target="_blank"
                  rel="noreferrer"
                  className="project-link"
                >
                  GitHub →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MINI GAMES */}
      <section id="games" className="games-section port-section">
        <div className="projects-inner">
          <div className="reveal">
            <span className="section-label">Just for Fun</span>
            <h2 className="section-title">Mini Games</h2>
          </div>
          <div className="games-grid">
            <a href="/tictactoe" className="game-card reveal">
              <div className="game-icon">✕ ○</div>
              <div className="game-info">
                <div className="game-title">Tic Tac Toe</div>
                <div className="game-desc">
                  Play against an unbeatable AI — Minimax algorithm with 3
                  difficulty levels.
                </div>
                <div className="game-tag">React · Minimax AI</div>
              </div>
              <div className="game-arrow">→</div>
            </a>

            <a href="/connectfour" className="game-card reveal">
              <div className="game-icon">🔴 🟡</div>
              <div className="game-info">
                <div className="game-title">Connect Four</div>
                <div className="game-desc">
                  Drop pieces against a strategic AI with alpha-beta pruning and
                  5-move lookahead.
                </div>
                <div className="game-tag">React · Minimax AI</div>
              </div>
              <div className="game-arrow">→</div>
            </a>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="contact-section port-section">
        <div className="contact-inner reveal">
          <span className="section-label">Contact</span>
          <h2 className="section-title">Let's Build Something</h2>
          <p className="contact-sub">
            I'm under contract and open to full time roles. Whether you have
            something in mind or just want to connect, my inbox is always
            open.
          </p>
          <a href="mailto:jakebarnett2000@gmail.com" className="contact-email">
            jakebarnett2000@gmail.com
          </a>
          <div className="social-links">
            <a
              href="https://github.com/JacobBarnett"
              target="_blank"
              rel="noreferrer"
              className="social-link"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/jacob-barnett-405725226/"
              target="_blank"
              rel="noreferrer"
              className="social-link"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" />
                <circle cx="4" cy="4" r="2" />
              </svg>
              LinkedIn
            </a>
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noreferrer"
              className="social-link"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Resume
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="port-footer">
        <p>Designed &amp; Built by Jacob Barnett &copy; 2026</p>
      </footer>
    </div>
  );
}
