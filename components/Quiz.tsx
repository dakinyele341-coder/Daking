"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/types/animation";
import { track } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

interface QuizProps {
  quiz: readonly QuizQuestion[];
  animationId: string;
}

/**
 * Walks the user through the quiz one question at a time, gives immediate
 * correct/incorrect feedback, then submits the final score to
 * `/api/quiz-results` and offers a retry.
 */
export function Quiz({ quiz, animationId }: QuizProps) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.map(() => null));
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const question = quiz[current];
  const selected = answers[current] ?? null;
  const answered = selected !== null;

  const score = answers.reduce<number>(
    (acc, a, idx) => acc + (a !== null && a === quiz[idx]?.correctIndex ? 1 : 0),
    0,
  );

  if (!question) return null;

  function handleSelect(optionIndex: number) {
    if (answered) return; // lock once answered
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = optionIndex;
      return next;
    });
  }

  async function submitResults() {
    setSubmitting(true);
    setSubmitError(null);
    track.quizCompleted(score, quiz.length);
    try {
      const res = await fetch("/api/quiz-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animationId, score, total: quiz.length }),
      });
      if (!res.ok) setSubmitError("We couldn't save your score, but here it is anyway.");
    } catch {
      setSubmitError("We couldn't save your score, but here it is anyway.");
    } finally {
      setSubmitting(false);
      setFinished(true);
    }
  }

  function handleNext() {
    if (current < quiz.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      void submitResults();
    }
  }

  function handleRetry() {
    setAnswers(quiz.map(() => null));
    setCurrent(0);
    setFinished(false);
    setSubmitError(null);
  }

  if (finished) {
    return (
      <div className="space-y-4 rounded-lg border border-border p-6 text-center">
        <h3 className="font-display text-xl font-semibold">Quiz complete</h3>
        <p className="text-3xl font-bold">
          {score} / {quiz.length}
        </p>
        {submitError && <p className="text-sm text-ink-muted">{submitError}</p>}
        <button
          onClick={handleRetry}
          className="rounded-md bg-marker px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-ink/15 p-6">
      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          Question {current + 1} of {quiz.length}
        </span>
        <span>Score: {score}</span>
      </div>

      <h3 className="text-lg font-semibold">{question.question}</h3>

      <ul className="space-y-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correctIndex;
          const isChosen = i === selected;
          return (
            <li key={i}>
              <button
                onClick={() => handleSelect(i)}
                disabled={answered}
                className={cn(
                  "w-full rounded-md border px-4 py-3 text-left text-sm transition-colors",
                  !answered && "border-ink/30 hover:bg-muted",
                  answered && isCorrect && "border-green-600 bg-green-50 text-green-900",
                  answered && isChosen && !isCorrect && "border-red-600 bg-red-50 text-red-900",
                  answered && !isCorrect && !isChosen && "border-ink/20 opacity-60",
                )}
              >
                {option}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            {selected === question.correctIndex ? "Correct!" : "Not quite."}
          </p>
          <button
            onClick={handleNext}
            disabled={submitting}
            className="rounded-md bg-marker px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {current < quiz.length - 1 ? "Next" : submitting ? "Saving…" : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}
