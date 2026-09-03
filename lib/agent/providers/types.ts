import type { AssemblyGraph, EvaluationScores, Scene } from "@/lib/agent/types";

export interface ImageInput {
  mimeType: string;
  base64: string;
}

export interface MediaProvider {
  name: "gemini" | "demo";
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
  }): Promise<boolean>;
  evaluateFrame(input: {
    scene: Scene;
    frame: ImageInput;
    previousFrame?: ImageInput;
    knownPartIds: string[];
  }): Promise<EvaluationScores>;
}
