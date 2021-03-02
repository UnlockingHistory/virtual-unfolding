import { Vector2 } from 'three';
import { TexturingParams, SegmentationParams, FlatteningParams } from './types';

// Params that can be set in the command line:
// VERBOSE
// FILENAME
// OUTPUT_PATH
// DEVICE_NUM

// Logging constants.
export const VERBOSE = false;

// File params constants.
export const FILENAME = 'DB-1538_58x58x58';
export const DATA_PATH = 'data/';
export const OUTPUT_PATH = 'output/';
export const ANIMATION_PATH = 'mappingFrames/'; // Directory without outputPath to save animation frames.
export const SHOULD_SAVE_ANIMATION = false; // Save out positions data to create animation.

// IO constants.
export const TOM_HEADER_NUM_BYTES = 512;
export const TOM_DIMENSIONS_START_POSITION = 0;
export const TOM_DIMENSIONS_NUM_BYTES = 6;
export const TOM_DATA_TYPE_START_POSITION = 320;
export const TOM_DATA_TYPE_NUM_BYTES = 10;
export const TOM_NUM_ELEMENTS_MARKER = 'NumEl';
export const TOM_NUM_ELEMENTS_START_POSITION = TOM_DATA_TYPE_START_POSITION + TOM_DATA_TYPE_NUM_BYTES;
export const TOM_NUM_ELEMENTS_NUM_BYTES = TOM_NUM_ELEMENTS_MARKER.length + 1;
export const TOM_USE_NULL_MARKER = 'Null';
export const TOM_USE_NULL_START_POSITION = TOM_NUM_ELEMENTS_START_POSITION + TOM_NUM_ELEMENTS_NUM_BYTES;
export const TOM_USE_NULL_NUM_BYTES = TOM_USE_NULL_MARKER.length + 1;
export const BIN_HEADER_NUM_BYTES = 100;
export const BIN_DIMENSIONS_START_POSITION = 0;
export const BIN_DIMENSIONS_NUM_BYTES = 4;
export const BIN_DATA_TYPE_START_POSITION = BIN_DIMENSIONS_START_POSITION + BIN_DIMENSIONS_NUM_BYTES;
export const BIN_DATA_TYPE_NUM_BYTES = 10;
export const BIN_NUM_ELEMENTS_START_POSITION = BIN_DATA_TYPE_START_POSITION + BIN_DATA_TYPE_NUM_BYTES;
export const BIN_NUM_ELEMENTS_NUM_BYTES = 1;
export const BIN_USE_NULL_START_POSITION = BIN_NUM_ELEMENTS_START_POSITION + BIN_NUM_ELEMENTS_NUM_BYTES;
export const BIN_USE_NULL_NUM_BYTES = 1;
export const MAX_NUM_ELEMENTS = 255;
export const BUFFER_WINDOW_SIZE = 4;

// OpenCL constants.
export const DEVICE_NUM = 0;

// Common constants (used in many places in pipeline).

// Expected width of a single layer of sheet material.
const EXPECTED_SINGLE_LAYER_WIDTH = 2.5;
// Physics simulation parameters.
// Stiffness of axial constraints.
const AXIAL_STIFFNESS = 10;
// A value of 0-1 scaling factor on the constraint damping.
const DAMPING_FACTOR = 0.5;

// Segmentation constants.
export const segmentationParams: SegmentationParams = {
	CLIP_VAL: 150, // Before segmentation processing, clip raw data to this greyscale val.
	// Expected width of a single layer of sheet material.
	// This value is set above and shared.
	EXPECTED_SINGLE_LAYER_WIDTH, 
	// We compute a set of highly blurred spatial derivatives of the raw data, this sets the scaling factor of the gaussian sigma param.
	// We've found these help reduce noise in our normal relaxation calculations.
	NORMAL_RELAX_GAUSS_SCALE: 3,
	// Num iterations of normal relaxation to run.
	NUM_NORMAL_RELAXATION_STEPS: 50,
	// Amount of blur to use for oriented blur.
	ORIENTED_BLUR_SIGMA: 0.5,
	// Num iterations of oriented blur to run.
	NUM_ORIENTED_BLUR_STEPS: 1,
	// Threshold for background noise of e.g. air in scan.
	NOISE_THRESHOLD: 25,
	// Minimum distance two vertices in segmentation mesh can be from each other.  Lowering this may result in stiff springs that slow down subsequent simulation steps.
	POINT_DETECTION_MERGE_TOL: 0.5,
	// Maximum single layer width in pixels.
	// TODO: this should be computed from EXPECTED_SINGLE_LAYER_WIDTH
	MAX_SINGLE_LAYER_WIDTH: 6,
	// Normals must be aligned within this tolerance to form an edge between them.
	MESHING_NORMAL_ALIGNMENT_TOL: Math.PI/6,
	// Edges in mesh must be orthogonal to point normal, within this tolerance.
	MESHING_EDGE_NORMAL_ORTHOG_TOL: Math.PI/6,
	// Maximum length of edge in mesh.
	MAX_EDGE_LENGTH: 1.75,
	// Maximum number of neighbors for each point in mesh.
	// Increasing this will lead to greater memory overhead.
	MAX_NUM_NEIGHBORS: 10,
	// Min angle between adjacent edges in mesh.
	MESHING_MIN_ANGLE: Math.PI/6,
	// Min size (number of vertices) of mesh connected component.
	MIN_MESH_COMPONENT_SIZE: 50,
};

// Flattening constants.
export const flatteningParams: FlatteningParams = {
	MAX_NUM_MAPPING_ATTEMPTS: 50, // Maximum number of times to attempt to map a point to 2D, must be < 256.
	MAX_BFGS_CONSTRAINTS: 20, // Maximum number of neighboring points to use in BFGS calc.
	FLATTENING_EDGE_LENGTH_ERROR_TOL: 0.25, // Acceptable error for flattening, 0.25 = 25% edge length error.
	AXIAL_STIFFNESS,
	DAMPING_FACTOR,
	NUM_FLATTENING_SIM_STEPS: 10, // Value must be divisible by 2.
}

// Texturing constants.
export const texturingParams: TexturingParams = {
	SCALE: 1, // If scale == 1, then each pixel has the same dimensions as the original scan data.
	PADDING: new Vector2(10, 10), // Padding around all sides of texturing images.
	Z_OFFSET: 0, // Offset for computing greyscale texture.
	CURVATURE_SCALING_FACTOR: 500, // Scales the opacity of the mapping from curvature to color in crease patterns.
	TRIANGLE_SEARCH_RADIUS: 2, // This should not need to be adjusted.
	STRAIN_CLIP_VAL: 0.1,// For a value of 0.1, clip max strain at 10%.
};


// TODO: OLD variables, delete this eventually.
// export const numItersSimPerPt = 20;
// export const svdTol = 0.2;
// export const fractureTol = 50;
// export const growingFractureTol = 150;
// export const ptRecheckCount = 50;// if >255; need to change ptsRecheckCount from UInt8Array

// export const meshMergingTol = 500;
// export const smallMeshMergeTol = 0.9;

// // Mapping 2D settings.
// export const shouldSaveFrames = false;
// export const mappingSavePeriod = 4; // How often to save while mapping seed and growing.
// export const mappingSaveNumPts = 10000; // How often to save while merging.


// // @ts-ignore
// export const pixelNormals = null;
// // @ts-ignore
// export const pixelPositions = null;

// export const bendStiffness = 15;
// export const angularStiffness = 5;
// export const stretchClipTol = 5.5;//tension tolerance on snapping
// export const allowSnap = false;
// export const numStepsPerKeyframe = 1;

