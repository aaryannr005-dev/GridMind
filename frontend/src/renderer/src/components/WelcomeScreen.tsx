import { useState, type FormEvent } from "react";

interface WelcomeScreenProps {
  onContinue: (name: string) => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!normalized) {
      setError("Enter a name to personalise your workspace.");
      return;
    }
    onContinue(normalized);
  }

  return (
    <main className="welcome-screen">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-brand"><span className="brand-mark" aria-hidden="true">G</span><span>GRIDMIND</span></div>
        <span className="eyebrow">YOUR ENERGY WORKSPACE</span>
        <h1 id="welcome-title">A clearer view of your energy.</h1>
        <p className="welcome-lede">Let's set up your workspace. What should we call you?</p>
        <form className="welcome-form" onSubmit={submit} noValidate>
          <label htmlFor="profile-name">Your name</label>
          <input id="profile-name" name="name" type="text" autoComplete="given-name" autoFocus maxLength={40} placeholder="Enter your name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} aria-describedby={error ? "profile-name-error" : undefined} />
          {error && <p className="welcome-error" id="profile-name-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Continue to GridMind <span aria-hidden="true">→</span></button>
        </form>
        <p className="welcome-privacy">Your name is stored locally on this device and is not sent to a server.</p>
      </section>
    </main>
  );
}
