import { performance } from 'perf_hooks';
import clipRawData from './ClipRawData';
import gaussConvolutions from './GaussConvolutions';
import normalsCalc from './NormalsCalc';
import normalsRelaxation from './NormalsRelaxation';
import orientedBlur from './OrientedBlur';
import pointGeneration from './PointGeneration';
import pointWidthCalc from './PointWidthCalc';
import meshing from './Meshing';
import { logTime, log } from '../common/utils';
import { FileParams, SegmentationParams } from '../common/types';
import { copyTom } from '../common/io';
import { gpuHelper } from '../globals/gpuHelper';

export default function run(fileParams: FileParams, segmentationParams: SegmentationParams) {
	log('\nRunning segmentation...\n')

	// Get all constants.
	const {
		CLIP_VAL,
		NORMAL_RELAX_GAUSS_SCALE,
		NUM_NORMAL_RELAXATION_STEPS,
		ORIENTED_BLUR_SIGMA,
		NUM_ORIENTED_BLUR_STEPS,
		NOISE_THRESHOLD,
		POINT_DETECTION_MERGE_TOL,
		EXPECTED_SINGLE_LAYER_WIDTH,
		MAX_SINGLE_LAYER_WIDTH,
		MESHING_NORMAL_ALIGNMENT_TOL,
		MESHING_EDGE_NORMAL_ORTHOG_TOL,
		MAX_EDGE_LENGTH,
		MAX_NUM_NEIGHBORS,
		MESHING_MIN_ANGLE,
		MIN_MESH_COMPONENT_SIZE,
	} = segmentationParams;
	// This is derived in "An Unbiased Detector of Curvilinear Structures" by Carsten Steger 1998
	// https://pdfs.semanticscholar.org/86de/a10b5c7b831a24132db3e4b50a01f9f001b0.pdf
	// Note the extra factor of 2 used here – the profile analyzed by Steger has width = 2 * w = EXPECTED_SINGLE_LAYER_WIDTH
	const GAUSS_KERNEL_SIGMA = EXPECTED_SINGLE_LAYER_WIDTH / (2 * Math.sqrt(3));
	
	const startTime = performance.now();

	// Make a copy of raw data in OUTPUT_PATH.
	copyTom(fileParams.DATA_PATH, fileParams.FILENAME, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_raw`);

    // Create a copy of raw data clipped to globals.inputClipVal.
    // This is used for calculating response in normals relaxation.
    clipRawData(
		gpuHelper,
		fileParams, 
		{ 
			CLIP_VAL,
		},
	);
    // Perform 3D gauss convolutions on raw data.
    gaussConvolutions(
		gpuHelper,
		fileParams,
		{ 
			GAUSS_KERNEL_SIGMA,
			NORMAL_RELAX_GAUSS_SCALE,
		},
	);
    // Calculate normal vector for each voxel.
	normalsCalc(
		gpuHelper,
		fileParams,
	);
    // Relax normals for a number of iterations to improve global coherence.
    normalsRelaxation(
		gpuHelper,
		fileParams,
		{
			NUM_NORMAL_RELAXATION_STEPS,
			NORMAL_RELAX_GAUSS_SCALE,
		}
	);
    // Blur raw data with blur orientation set by relaxed voxel normals.
	orientedBlur(
		gpuHelper,
		fileParams,
		{
			NUM_ORIENTED_BLUR_STEPS,
			ORIENTED_BLUR_SIGMA,
		},
	);
    // Generate feature points.
    pointGeneration(
		gpuHelper,
		fileParams,
		{
			GAUSS_KERNEL_SIGMA,
			NOISE_THRESHOLD,
			POINT_DETECTION_MERGE_TOL,
		},
	);
    // Calculate approx widths for feature points.
	pointWidthCalc(
		gpuHelper,
		fileParams,
		{
			MAX_SINGLE_LAYER_WIDTH,
			NOISE_THRESHOLD,
			GAUSS_KERNEL_SIGMA,
		},
	);
    // Mesh points.
    meshing(
		gpuHelper,
		fileParams,
		{
			MAX_NUM_NEIGHBORS,
			MESHING_NORMAL_ALIGNMENT_TOL,
			MESHING_EDGE_NORMAL_ORTHOG_TOL,
			MAX_EDGE_LENGTH,
			MESHING_MIN_ANGLE,
			MAX_SINGLE_LAYER_WIDTH,
			MIN_MESH_COMPONENT_SIZE,
		}
	);
    // Clean up.
	gpuHelper.clear();

	logTime('\tsegmentation', startTime);
};