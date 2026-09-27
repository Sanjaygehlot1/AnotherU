"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const steps = [
  {
    title: "Let's start with you.",
    description:
      "Not your resume. Not your LinkedIn. Just the things that make you, you.",
    placeholder: "Tell us a little about yourself...",
    key: "about" as const,
  },
  {
    title: "What matters to you?",
    description:
      "The people, things, interests, or ideas that currently matter in your life.",
    placeholder: "What matters to you right now?",
    key: "values" as const,
  },
  {
    title: "Where are you headed?",
    description:
      "Tell your future selves what you're chasing, even if you're not sure yet.",
    placeholder: "What do you want your future to look like?",
    key: "future" as const,
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);

  const [answers, setAnswers] = useState({
    about: "",
    values: "",
    future: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const current = steps[step];

  function updateAnswer(value: string) {
    setAnswers((previous) => ({
      ...previous,
      [current.key]: value,
    }));
  }

  async function next() {
    setError("");

    if (!answers[current.key].trim()) {
      setError("Take a moment and tell us something.");
      return;
    }

    if (step < steps.length - 1) {
      setStep((previous) => previous + 1);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(answers),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      router.push("/timeline");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">
            AnotherU
          </span>

          <span className="text-sm text-muted-foreground">
            {step + 1} / {steps.length}
          </span>
        </header>

        <div className="mt-16 flex-1">
          <div className="mb-10 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-500"
              style={{
                width: `${((step + 1) / steps.length) * 100}%`,
              }}
            />
          </div>

          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {current.title}
            </h1>

            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {current.description}
            </p>

            <textarea
              value={answers[current.key]}
              onChange={(event) => updateAnswer(event.target.value)}
              placeholder={current.placeholder}
              className="mt-10 min-h-52 w-full resize-none rounded-2xl border border-border bg-card p-5 text-base outline-none transition placeholder:text-muted-foreground focus:border-foreground"
              autoFocus
              disabled={isSaving}
            />

            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setStep((previous) => Math.max(0, previous - 1))
                }
                disabled={step === 0 || isSaving}
                className="rounded-full px-5 py-3 text-sm font-medium transition hover:bg-muted disabled:pointer-events-none disabled:opacity-0"
              >
                Back
              </button>

              <button
                type="button"
                onClick={next}
                disabled={isSaving}
                className="rounded-full bg-foreground px-7 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving
                  ? "Creating your timeline..."
                  : step === steps.length - 1
                    ? "Enter my timeline"
                    : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}