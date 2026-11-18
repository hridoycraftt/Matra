import { useState } from "react";
import { inApp, useApiKey } from "../lib/platform";
import { PROVIDERS } from "../lib/types";
import { AIProvider, OtherApps, usePermission, type SettingsProps } from "./SettingsView";
import { IconAI, IconApps, IconCheck, LogoMark } from "./Icons";

type Step = "welcome" | "ai" | "apps" | "try";

/** First run: connect an AI, allow other apps, try a check. Every step can be skipped. */
export function Onboarding(p: SettingsProps & { onFinish(): void }) {
  const steps: Step[] = inApp ? ["welcome", "ai", "apps", "try"] : ["welcome", "ai", "try"];
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey] = useApiKey(p.settings.provider);
  const trusted = usePermission();
  const i = steps.indexOf(step);
  const next = () => (i < steps.length - 1 ? setStep(steps[i + 1]) : p.onFinish());
  const provider = PROVIDERS.find((x) => x.id === p.settings.provider)!;

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Welcome to Matra">
      <div className="onboard-card">
        <div className="onboard-steps" aria-hidden="true">
          {steps.map((s, n) => (
            <span key={s} className={`onboard-dot${n <= i ? " is-on" : ""}`} />
          ))}
        </div>

        {step === "welcome" && (
          <div className="onboard-hero">
            <LogoMark size={56} />
            <h1>Write clearly, everywhere.</h1>
            <p>
              Matra checks your English and Bangla as you type — here and in Mail, Slack, Chrome and every other app.
              It's free, and your key stays on your Mac.
            </p>
          </div>
        )}

        {step === "ai" && (
          <>
            <header className="onboard-head">
              <span className="tile tile-pink" aria-hidden="true"><IconAI size={16} /></span>
              <div>
                <h2>Connect an AI</h2>
                <p>Google Gemini has a free key. It takes a minute at {PROVIDERS[0].keyUrl}.</p>
              </div>
            </header>
            <AIProvider {...p} />
          </>
        )}

        {step === "apps" && (
          <>
            <header className="onboard-head">
              <span className="tile tile-indigo" aria-hidden="true"><IconApps size={16} /></span>
              <div>
                <h2>Use Matra in other apps</h2>
                <p>Allow Accessibility so Matra can read the text box you're in and put fixes back.</p>
              </div>
            </header>
            <OtherApps {...p} />
          </>
        )}

        {step === "try" && (
          <div className="onboard-hero">
            <span className="onboard-ok" aria-hidden="true"><IconCheck size={26} /></span>
            <h1>You're set.</h1>
            <p>
              {apiKey
                ? "Your Welcome document has a few mistakes in it. Press Check to see Matra at work."
                : `Add your ${provider.label} key any time in Settings → AI provider to start checking.`}
              {inApp && !trusted && " Matra will help in other apps once Accessibility is allowed."}
            </p>
          </div>
        )}

        <footer className="onboard-foot">
          {step !== "welcome" && step !== "try" ? (
            <button className="btn btn-quiet" onClick={next}>Skip this step</button>
          ) : step === "welcome" ? (
            <button className="btn btn-quiet" onClick={p.onFinish}>Skip setup</button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" onClick={next}>
            {step === "welcome" ? "Get started" : step === "try" ? "Start writing" : "Continue"}
          </button>
        </footer>
      </div>
    </div>
  );
}
