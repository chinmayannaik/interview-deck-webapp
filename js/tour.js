/* ============================================================
   Interview Questions Bank — Interactive Product Tour
   Implements a premium spotlight-based user onboarding tour
   ============================================================ */
(function () {
  window.IQB = window.IQB || {};

  const steps = [
    {
      title: "Welcome to InterviewDeck!",
      desc: "Master interviews with an interactive question bank.<br><br>Let's take a quick 30-second tour to see the key features.",
      target: null,
      nextText: "Start Tour",
      setup: function () {
        // welcome card
      }
    },
    {
      title: "Step 1 – Choose Your Domain",
      desc: "Select your interview domain here. Each category contains carefully curated interview questions for that technology stack.<br><br>",
      target: "#tabs",
      setup: function () {
        if (window.IQB.app && typeof IQB.app.setCategory === "function") {
          IQB.app.setCategory("frontend", false);
        }
      }
    },
    {
      title: "Step 2 – Choose a Technology",
      desc: "Each technology is organized into focused topics. Pick the technology you are preparing for.<br><br>",
      target: '#sidebar-nav .side-link[data-cat="angular"]',
      fallbackTarget: "#sidebar-nav .side-link:nth-child(2)",
      setup: function () {
        if (window.IQB.app && typeof IQB.app.setCategory === "function") {
          IQB.app.setCategory("frontend", false);
        }
      }
    },
    {
      title: "Step 3 – Question Card Features",
      desc: `Here is a detailed look at an open question card. It includes a quick interview answer, a deep dive section, personal notes, highlights, bookmarks, and a Report Issue button if you spot a mistake:
             <div style="text-align: center; margin-top: 12px;">
               <img src="assets/tour-card.png" alt="Question card features" style="width: 100%; border-radius: 8px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);" />
             </div>`,
      target: null,
      isImageStep: true,
      setup: function () {
        if (window.IQB.app && typeof IQB.app.setCategory === "function") {
          IQB.app.setCategory("angular", false);
        }
      }
    },
    {
      title: "Step 4 – Reading Mode & Full Screen",
      desc: "<b>Distraction-Free Reading</b><br><br>Hide the sidebar and filters to focus only on the current question.<br><br><i>For the best experience, press <b>F11</b> to enter your browser's full-screen mode.</i>",
      target: "#reading-mode-toggle",
      nextText: "Finish Tour",
      setup: function () {
        if (window.IQB.app && typeof IQB.app.setCategory === "function") {
          IQB.app.setCategory("angular", false);
        }
      }
    }
  ];

  let currentStep = 0;
  let overlayEl = null;
  let spotlightEl = null;
  let tooltipEl = null;

  /* Below 900px the tabs bar and the sidebar are display:none (see the responsive
     block in styles.css), so steps 1 and 2 have nothing to point at on a phone.
     Every step is shown as a centered card there instead of a spotlight. */
  function isMobile() { return window.matchMedia("(max-width: 900px)").matches; }

  /* A display:none target still resolves via querySelector but measures 0x0 at
     (0,0), which spotlights the top-left corner rather than failing loudly —
     treat that as "no target" so the step falls back to the centered card. */
  function hasVisibleBox(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function initTour() {
    const completed = localStorage.getItem("iqb_tour_completed");
    if (completed === "true") return;

    // Build Tour HTML structure dynamically
    overlayEl = document.createElement("div");
    overlayEl.id = "tour-overlay";
    overlayEl.className = "tour-overlay";

    spotlightEl = document.createElement("div");
    spotlightEl.id = "tour-spotlight";
    spotlightEl.className = "tour-spotlight";

    tooltipEl = document.createElement("div");
    tooltipEl.id = "tour-tooltip";
    tooltipEl.className = "tour-tooltip";

    tooltipEl.innerHTML = `
      <div class="tour-tooltip-content">
        <div class="tour-step-indicator" id="tour-indicator"></div>
        <h3 class="tour-step-title" id="tour-title"></h3>
        <p class="tour-step-desc" id="tour-desc"></p>
        <div class="tour-tooltip-actions">
          <button class="tour-btn tour-btn-skip" id="tour-btn-skip" type="button">Skip</button>
          <div class="tour-tooltip-nav">
            <button class="tour-btn tour-btn-back" id="tour-btn-back" type="button">Back</button>
            <button class="tour-btn tour-btn-next" id="tour-btn-next" type="button">Next</button>
          </div>
        </div>
      </div>
    `;

    overlayEl.appendChild(spotlightEl);
    overlayEl.appendChild(tooltipEl);
    document.body.appendChild(overlayEl);

    // Event listeners
    document.getElementById("tour-btn-skip").onclick = endTour;
    document.getElementById("tour-btn-back").onclick = prevStep;
    document.getElementById("tour-btn-next").onclick = nextStep;

    // Clicking the backdrop (anywhere outside the tooltip) dismisses the tour.
    // Without this, a first-time visitor who ignores the tooltip and tries to
    // click the tabs/filters/difficulty controls is silently blocked by the
    // z-index:1000 overlay and the app feels frozen — the clicks only "work"
    // after a refresh (which skips the already-seen tour). Any click now ends
    // the tour so interacting with the app is itself the escape hatch.
    overlayEl.addEventListener("click", (e) => {
      if (!tooltipEl.contains(e.target)) endTour();
    });

    // Start with a small timeout to let app finish initial category loads
    setTimeout(startTour, 800);
  }

  function startTour() {
    currentStep = 0;
    overlayEl.classList.add("show");
    document.body.classList.add("tour-active");
    showStep();
  }

  function endTour() {
    // initTour() skips building overlayEl entirely once the tour is already
    // completed — end() must stay a safe no-op for a caller (e.g. the AI
    // Tutor, dismissing any in-progress tour on open) that doesn't know
    // whether a tour ever started this session.
    if (overlayEl) overlayEl.classList.remove("show");
    document.body.classList.remove("tour-active");
    localStorage.setItem("iqb_tour_completed", "true");

    // Once tour ends or skips, show Google login suggestion prompt if not signed in
    if (window.IQB.sync && typeof window.IQB.sync.maybeShowPrompt === "function") {
      window.IQB.sync.maybeShowPrompt();
    }
  }

  function nextStep() {
    if (currentStep < steps.length - 1) {
      currentStep++;
      showStep();
    } else {
      endTour();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      showStep();
    }
  }

  function showStep() {
    const step = steps[currentStep];
    const ind = document.getElementById("tour-indicator");
    const tit = document.getElementById("tour-title");
    const des = document.getElementById("tour-desc");
    const backBtn = document.getElementById("tour-btn-back");
    const nextBtn = document.getElementById("tour-btn-next");

    tooltipEl.classList.remove("show");

    // Run setup action for the step (like category loading)
    if (typeof step.setup === "function") {
      step.setup();
    }

    ind.textContent = currentStep === 0 ? "Onboarding" : `Step ${currentStep} of ${steps.length - 1}`;
    tit.innerHTML = step.title;
    des.innerHTML = step.desc;

    // Nav visibility
    backBtn.style.display = currentStep === 0 ? "none" : "inline-block";
    nextBtn.textContent = step.nextText || "Next";

    // Wait a brief moment for DOM layouts to settle from setup operations
    setTimeout(() => {
      let targetEl = null;
      if (typeof step.target === "function") {
        targetEl = step.target();
      } else if (typeof step.target === "string") {
        targetEl = document.querySelector(step.target);
        if (!targetEl && step.fallbackTarget) {
          targetEl = document.querySelector(step.fallbackTarget);
        }
      }
      positionSpotlight(targetEl, step.isImageStep);
    }, 250);
  }

  function positionSpotlight(targetEl, isImageStep) {
    if (!targetEl || !hasVisibleBox(targetEl) || isMobile()) {
      // Welcome Step, Image Step, or any step on mobile — centered modal.
      // The 0x0 spotlight keeps the full-page dim (it comes from the ring's
      // 9999px box-shadow) while collapsing the ring itself behind the card.
      spotlightEl.style.width = "0px";
      spotlightEl.style.height = "0px";
      spotlightEl.style.top = "50%";
      spotlightEl.style.left = "50%";
      spotlightEl.style.borderRadius = "50%";
      
      tooltipEl.className = isImageStep ? "tour-tooltip tour-image-card" : "tour-tooltip tour-welcome-card";
      tooltipEl.style.top = "50%";
      tooltipEl.style.left = "50%";
      
      setTimeout(() => tooltipEl.classList.add("show"), 50);
      return;
    }

    tooltipEl.className = "tour-tooltip";

    // Scroll target into view
    const rectBeforeScroll = targetEl.getBoundingClientRect();
    if (rectBeforeScroll.height > 300) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Wait for scroll adjustment
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      const pad = 6;
      let targetHeight = rect.height;
      if (targetHeight > 300) {
        targetHeight = 300; // limit height so it fits on screen
      }

      spotlightEl.style.top = (rect.top + scrollY - pad) + "px";
      spotlightEl.style.left = (rect.left + scrollX - pad) + "px";
      spotlightEl.style.width = (rect.width + pad * 2) + "px";
      spotlightEl.style.height = (targetHeight + pad * 2) + "px";
      spotlightEl.style.borderRadius = window.getComputedStyle(targetEl).borderRadius || "8px";

      /* Place the card against the target's real size, not a guess.
         The old code assumed a 320x240 card and flipped it "above" by a flat
         240px. The card is ~330px tall, so for a target in the bottom-right
         corner — Reading Mode, step 4 — flipping moved it up 240px and still
         left its lower half sitting on top of the very button it was pointing
         at. Measuring means the flip actually clears the target, whatever the
         step's copy happens to be. */
      const tipW = tooltipEl.offsetWidth || 320;
      const tipH = tooltipEl.offsetHeight || 240;
      const M = 12; // gap to the target, and to the viewport edges

      // prefer below the target; flip above when it would not fit
      let tooltipTop = rect.bottom + M;
      if (tooltipTop + tipH > window.innerHeight - M) {
        const above = rect.top - tipH - M;
        // if neither side fits, sit as low as the viewport allows rather than
        // hanging off the bottom
        tooltipTop = above >= M ? above : Math.max(M, window.innerHeight - tipH - M);
      }
      tooltipTop += scrollY;

      // centre on the target, then clamp so it stays fully on screen
      let tooltipLeft = rect.left + (rect.width - tipW) / 2;
      tooltipLeft = Math.min(tooltipLeft, window.innerWidth - tipW - M);
      tooltipLeft = Math.max(M, tooltipLeft);
      tooltipLeft += scrollX;

      tooltipEl.style.top = Math.round(tooltipTop) + "px";
      tooltipEl.style.left = Math.round(tooltipLeft) + "px";
      tooltipEl.classList.add("show");
    }, 200);
  }

  // Handle window resizing
  window.addEventListener("resize", () => {
    if (overlayEl && overlayEl.classList.contains("show")) {
      const step = steps[currentStep];
      let targetEl = null;
      if (typeof step.target === "function") {
        targetEl = step.target();
      } else if (typeof step.target === "string") {
        targetEl = document.querySelector(step.target);
        if (!targetEl && step.fallbackTarget) {
          targetEl = document.querySelector(step.fallbackTarget);
        }
      }
      positionSpotlight(targetEl, step.isImageStep);
    }
  });

  window.IQB = window.IQB || {};
  // exposed so other overlays (e.g. the AI Tutor panel) can dismiss an in-progress
  // tour instead of fighting it for clicks — endTour() is idempotent if no tour is active
  window.IQB.tour = { start: startTour, init: initTour, end: endTour };
})();
