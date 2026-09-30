export { trace } from "./trace/index.js";
export type { TraceOptions, TraceResult, BBox } from "./trace/types.js";
export { computeBBox, normalizePath, flattenToFacets } from "./trace/geometry.js";
export { extractPathData } from "./trace/traceSvg.js";
export {
  generateComponentSource,
  generateAndFormatComponent,
  type CodegenOptions,
} from "./codegen/generateComponent.js";
export { toPascalCase, componentNameFromFile, assertValidComponentName } from "./codegen/naming.js";
