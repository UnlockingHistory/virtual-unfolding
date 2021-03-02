import { Vector3, Vector2 } from 'three';
import { DeepReadonly } from 'ts-essentials';

export type FileParams = DeepReadonly<{
	FILENAME: string,
	DIMENSIONS: Vector3,
	DATA_PATH: string,
	OUTPUT_PATH: string,
	SHOULD_SAVE_ANIMATION?: boolean,
	ANIMATION_PATH?: string,
}>

export type SegmentationParams = DeepReadonly<{
	CLIP_VAL: number,
	NORMAL_RELAX_GAUSS_SCALE: number,
	NUM_NORMAL_RELAXATION_STEPS: number,
	ORIENTED_BLUR_SIGMA: number,
	NUM_ORIENTED_BLUR_STEPS: number,
	NOISE_THRESHOLD: number,
	POINT_DETECTION_MERGE_TOL: number,
	EXPECTED_SINGLE_LAYER_WIDTH: number,
	MAX_SINGLE_LAYER_WIDTH: number,
	MESHING_NORMAL_ALIGNMENT_TOL: number,
	MESHING_EDGE_NORMAL_ORTHOG_TOL: number,
	MAX_EDGE_LENGTH: number,
	MAX_NUM_NEIGHBORS: number,
	MESHING_MIN_ANGLE: number,
	MIN_MESH_COMPONENT_SIZE: number,
}>

export type FlatteningParams = DeepReadonly<{
	MAX_NUM_MAPPING_ATTEMPTS: number,
	MAX_BFGS_CONSTRAINTS: number,
	FLATTENING_EDGE_LENGTH_ERROR_TOL: number,
	AXIAL_STIFFNESS: number,
	DAMPING_FACTOR: number,
	NUM_FLATTENING_SIM_STEPS: number,
}>

export type TexturingParams = DeepReadonly<{
	SCALE: number,
	PADDING: Vector2,
	Z_OFFSET: number,
	CURVATURE_SCALING_FACTOR: number,
	TRIANGLE_SEARCH_RADIUS: number,
	STRAIN_CLIP_VAL: number,
}>

export namespace Axis {
	export const X = 0;
	export type X = typeof X;
	export const Y = 1;
	export type Y = typeof Y;
	export const Z = 2;
	export type Z = typeof Z;
}
export type Axis = typeof Axis[keyof typeof Axis];

// Valid types for Tom files.
export type TomType = 'uint8' | 'float32' | 'uint32' | 'int32';
export type TomTypedArray = Uint8Array | Float32Array | Uint32Array | Int32Array;
// These are the types currently in use in the app.
export type Type = 'uint8' | 'float32' | 'uint32' | 'int32' | 'int16' | 'uint16';
export type TypedArray = Uint8Array | Float32Array | Uint32Array | Int32Array | Int16Array | Uint16Array;
export type GPUTypedArray = Float32Array | Int32Array | Uint8Array;

export interface Bounds2 {
	min: Vector2,
	max: Vector2,
}

export type GPUBufferDataType = 'float*' | 'int*' | 'uchar*';