import { useEffect } from "react";
import "./Portfolio.css";

export default function Portfolio() {
  // Scroll reveal effect
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
          <a href="#contact">Contact</a>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="hero-section port-section">
        <div className="hero-inner">
          <span className="hero-tag">Available for hire</span>
          <h1 className="hero-h1">
            Jacob
            <br />
            <em>Barnett</em>
          </h1>
          <p className="hero-sub">
            Full Stack Web Developer — building thoughtful, performant
            applications from idea to deployment.
          </p>
          <div className="hero-cta">
            <a href="#projects" className="btn btn-primary">
              View Projects
            </a>
            <a href="#contact" className="btn btn-outline">
              Get in Touch
            </a>
          </div>
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
              I'm a <strong>Full Stack Web Developer</strong> and recent
              graduate of Bloomtech's Full Stack Web Development program, with a
              journey in software that started back in 2020 out of pure
              curiosity.
            </p>
            <p>
              What began as a personal interest quickly grew into a serious
              passion. I spent years exploring languages, building projects, and
              developing the kind of self-directed problem-solving mindset that
              only comes from <strong>learning by doing</strong>.
            </p>
            <p>
              I bring a <strong>strong work ethic</strong>, an eagerness to keep
              growing, and the discipline to see every project through to the
              finish line — no matter how challenging it gets.
            </p>
          </div>
          <div className="about-stats reveal">
            <div className="stat-card">
              <div className="stat-number">5+</div>
              <div className="stat-label">Years Coding</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">2024</div>
              <div className="stat-label">Bloomtech Graduate</div>
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
                  "REST APIs",
                  "SQL",
                  "Knex.js",
                  "Authentication / JWT",
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
                  "VS Code",
                  "Command Line",
                  "Agile / Scrum",
                  "Testing",
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

      {/* PROJECTS */}
      <section id="projects" className="projects-section port-section">
        <div className="projects-inner">
          <div className="reveal">
            <span className="section-label">Work</span>
            <h2 className="section-title">Projects</h2>
          </div>
          <div className="projects-grid">
            {[
              { num: "01", tag: "Full Stack · Placeholder" },
              { num: "02", tag: "Frontend · Placeholder" },
              { num: "03", tag: "Backend · Placeholder" },
            ].map(({ num, tag }) => (
              <div className="project-card reveal" key={num}>
                <div className="project-number">{num}</div>
                <div className="project-tag">{tag}</div>
                <h3 className="project-title">Project Title Coming Soon</h3>
                <p className="project-desc">
                  A brief description of what this project does, the problem it
                  solves, and what technologies were used to build it. Replace
                  with your real project details.
                </p>
                <div className="project-links">
                  <a href="#" className="project-link">
                    Live Demo →
                  </a>
                  <a href="#" className="project-link">
                    GitHub →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="contact-section port-section">
        <div className="contact-inner reveal">
          <span className="section-label">Contact</span>
          <h2 className="section-title">Let's Build Something</h2>
          <p className="contact-sub">
            I'm currently open to new opportunities. Whether you have a role in
            mind or just want to connect, my inbox is always open.
          </p>
          <a href="mailto:your@email.com" className="contact-email">
            your@email.com
          </a>
          <div className="social-links">
            <a href="#" className="social-link">
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
            <a href="#" className="social-link">
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
            <a href="#" className="social-link">
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
        <p>Designed &amp; Built by Jacob Barnett &copy; 2025</p>
      </footer>
    </div>
  );
}
