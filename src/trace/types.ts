export interface TraceResult {
  /** Normalized path `d` string, mapped into the unit square (0,0)-(1,1). */
  pathD: string;
  /** width / height of the *original* traced asset, before normalization. */
  aspectRatio: number;
  /** Number of subpaths in the traced shape (>1 usually means holes/compound shapes). */
  subpathCount: number;
  /** Where the asset came from, for provenance comments in generated code. */
  sourceFile: string;
  sourceKind: "svg" | "raster";
}

export interface TraceOptions {
  /**
   * Snap curves into straight-line facets (a low-poly / chamfered look).
   * Value is the max chord length (in normalized 0..1 units) used when
   * subdividing each curve — smaller = more facets = closer to the original curve.
   */
  facet?: number;
  /** Uniform padding added around the bounding box before normalizing, 0..1 (e.g. 0.02 = 2%). */
  padding?: number;
  /** For raster input: potrace tuning. */
  raster?: {
    threshold?: number;
    turdSize?: number;
    optTolerance?: number;
    blackOnWhite?: boolean;
  };
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
