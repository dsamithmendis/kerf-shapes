declare module "potrace" {
  export interface TraceParams {
    turnPolicy?: string;
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
  }

  export function trace(
    input: string | Buffer,
    params: TraceParams,
    callback: (err: Error | null, svg: string) => void
  ): void;

  export function trace(
    input: string | Buffer,
    callback: (err: Error | null, svg: string) => void
  ): void;
}
