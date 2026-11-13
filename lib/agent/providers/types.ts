import type { Storyboard, StoryboardPage } from "@/lib/agent/storyboard";
import type { AssemblyGraph, EvaluationScores, Scene } from "@/lib/agent/types";

export interface ImageInput {
  mimeType: string;
  base64: string;
}

export interface StillJudgement {
  /** 0–1: how clearly the photo shows the same moment as the manual drawing. */
  matches: number;
  problems: string[];
  critique: string;
}

export interface MediaProvider {
  name: "openai" | "gemini" | "demo";
  understand(input: {
    text: string;
    images: ImageInput[];
  }): Promise<AssemblyGraph>;
  plan(graph: AssemblyGraph): Promise<Scene[]>;
  enhancePrompt(scene: Scene, critique?: string): Promise<Scene>;
  generateFrame(input: {
    scene: Scene;
    reference?: ImageInput;
  }): Promise<Buffer | null>;
  generateVideo(input: {
    scene: Scene;
    framePath: string;
    outputPath: string;
    totalScenes?: number;
  }): Promise<boolean>;
  generateSpeech(input: {
    scene: Scene;
    totalScenes: number;
  }): Promise<Buffer | null>;
  evaluateFrame(input: {
    scene: Scene;
    frame: ImageInput;
    previousFrame?: ImageInput;
    knownPartIds: string[];
  }): Promise<EvaluationScores>;

  /** One vision pass over every page that returns the whole storyboard. */
  storyboard?(input: { sourceName: string; pages: StoryboardPage[] }): Promise<Storyboard>;
  /** Photo still from a finished prompt, edited from the manual drawing when given. */
  generateStill?(input: { prompt: string; reference?: ImageInput }): Promise<Buffer | null>;
  /** Narration audio for one finished line. */
  speak?(text: string): Promise<Buffer | null>;
  /** Compare a generated still with the manual drawing it must show. */
  judgeStill?(input: {
    scene: Scene;
    still: ImageInput;
    reference?: ImageInput;
  }): Promise<StillJudgement>;
}
