import type { AnimationData } from "@/lib/types/animation";

/**
 * Hardcoded sample used by the landing-page live demo. It's a real
 * `AnimationData` rendered by the actual `AnimationPlayer` — not a video or
 * screenshot. Coordinates live on the 1280x720 canvas.
 */
export const SAMPLE_ANIMATION: AnimationData = {
  summary:
    "Photosynthesis is how plants make their own food: leaves capture sunlight and use it to turn water and carbon dioxide into glucose (sugar), releasing oxygen as a bonus.",
  scenes: [
    {
      narration:
        "It starts with sunlight. A plant's leaves are like tiny solar panels that catch the sun's energy.",
      elements: [
        { type: "icon", icon: "sun", x: 120, y: 90, size: 140 },
        { type: "text", text: "Sunlight", x: 130, y: 290, size: 30 },
        { type: "icon", icon: "leaf", x: 880, y: 280, size: 170 },
        { type: "text", text: "Leaf", x: 935, y: 500, size: 30 },
        { type: "arrow", x1: 280, y1: 180, x2: 860, y2: 330 },
      ],
    },
    {
      narration:
        "The leaf pulls in water from the roots and carbon dioxide from the air.",
      elements: [
        { type: "icon", icon: "droplet", x: 150, y: 380, size: 120 },
        { type: "text", text: "Water (H₂O)", x: 110, y: 560, size: 28 },
        { type: "text", text: "CO₂ from the air", x: 520, y: 150, size: 28 },
        { type: "arrow", x1: 300, y1: 440, x2: 620, y2: 360 },
        { type: "arrow", x1: 720, y1: 200, x2: 880, y2: 300 },
        { type: "icon", icon: "leaf", x: 900, y: 300, size: 150 },
      ],
    },
    {
      narration:
        "Using the sun's energy, the leaf turns those ingredients into sugar for food, and breathes out oxygen.",
      elements: [
        { type: "icon", icon: "leaf", x: 560, y: 120, size: 150 },
        { type: "text", text: "Glucose (sugar)", x: 180, y: 480, size: 30 },
        { type: "text", text: "Oxygen (O₂)", x: 820, y: 480, size: 30 },
        { type: "arrow", x1: 600, y1: 300, x2: 320, y2: 440 },
        { type: "arrow", x1: 700, y1: 300, x2: 920, y2: 440 },
      ],
    },
  ],
  quiz: [
    {
      question: "What energy source powers photosynthesis?",
      options: ["Sunlight", "Electricity", "Wind", "Moonlight"],
      correctIndex: 0,
    },
    {
      question: "Which gas do plants take in for photosynthesis?",
      options: ["Oxygen", "Carbon dioxide", "Hydrogen", "Nitrogen"],
      correctIndex: 1,
    },
    {
      question: "What does photosynthesis produce for the plant to use as food?",
      options: ["Protein", "Glucose (sugar)", "Salt", "Water"],
      correctIndex: 1,
    },
  ],
};
