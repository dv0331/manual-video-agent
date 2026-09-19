export interface SampleCard {
  id: string;
  title: string;
  subtitle: string;
  attribution: string;
  thumb: string;
  pdfPublicPath: string;
}

export const SAMPLE_CARDS: SampleCard[] = [
  {
    id: "ap-1",
    title: "AP-1 benchtop arbor press",
    subtitle: "Original mechanical kit — 6 steps, torque and warnings",
    attribution: "Original sample written for this tool",
    thumb: "/sample-manual/fig-01.png",
    pdfPublicPath: "/sample-manual/AP-1-ASM-001.pdf",
  },
  {
    id: "kallax",
    title: "IKEA KALLAX shelf unit",
    subtitle: "Official IKEA assembly manual — cube shelf, wall-anchor warning",
    attribution: "Inter IKEA Systems B.V. published assembly instructions",
    thumb: "/sample-manuals/kallax.png",
    pdfPublicPath: "/sample-manuals/kallax.pdf",
  },
  {
    id: "bekvam",
    title: "IKEA BEKVÄM step stool",
    subtitle: "IKEA 3D Assembly Dataset — wood stool, 4 steps",
    attribution: "IKEA 3D Assembly Dataset, Inter IKEA Systems B.V.",
    thumb: "/sample-manuals/bekvam.png",
    pdfPublicPath: "/sample-manuals/bekvam.pdf",
  },
  {
    id: "lack",
    title: "IKEA LACK side table",
    subtitle: "IKEA 3D Assembly Dataset — four legs into a tabletop",
    attribution: "IKEA 3D Assembly Dataset, Inter IKEA Systems B.V.",
    thumb: "/sample-manuals/lack.png",
    pdfPublicPath: "/sample-manuals/lack.pdf",
  },
];
