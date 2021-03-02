import GPUHelper from '../common/GPUHelper';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { BufferedTomDataRWOverwrite } from '../common/BufferedTomDataRWOverwrite';
import { performance } from 'perf_hooks';
import { Vector3 } from 'three';
import { nullValForType, log, logTime, positionToIndex3D } from '../common/utils';
import { makeG1Kernel, makeG2Kernel } from '../common/kernels';
import { FileParams, GPUTypedArray } from '../common/types';
import MutableTypedArray from '../common/MutableTypedArray';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		GAUSS_KERNEL_SIGMA: number,
		NOISE_THRESHOLD: number,
		POINT_DETECTION_MERGE_TOL: number,
	}>,
) {
	const startTime = performance.now();
	
	// Constants.
	const {
		GAUSS_KERNEL_SIGMA,
		NOISE_THRESHOLD,
		POINT_DETECTION_MERGE_TOL,
	} = params;
	// Init kernels.
	const g1 = makeG1Kernel(GAUSS_KERNEL_SIGMA);
	const g2 = makeG2Kernel(GAUSS_KERNEL_SIGMA);
    const LAYER_LENGTH = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y;
	const KERNEL_DIM = Math.floor(g1.length / 2);

    // Init gpu program.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/pointsGenerationProgram.cl', 
		'pointsGeneration',
		{
			NOISE_THRESHOLD: {
				value: NOISE_THRESHOLD,
				type: 'uint8',
			},
			KERNEL_DIM: {
				value: KERNEL_DIM,
				type: 'uint32',
			},
		});

    // Load normals.
    const normals = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_normalsRelaxed', 0);

    // Init files for saving output data.
    const allPoints = new BufferedTomDataRWOverwrite(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allPoints', 'float32', fileParams.DIMENSIONS, 3, true);

    // Create buffers.
    gpuHelper.createFloat32GPUBufferFromTom('data', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_blurred', 'read');
    gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read');
    gpuHelper.createGPUBuffer('firstDerivKernel', g1, 'float*', 'read');
	gpuHelper.createGPUBuffer('secondDerivKernel', g2, 'float*', 'read');
	gpuHelper.createGPUBuffer('points', null, 'float*', 'write', LAYER_LENGTH * 3);
	gpuHelper.createGPUBuffer('normals', null, 'float*', 'read', LAYER_LENGTH * 3);

	// Set kernel arguments.
	gpuHelper.setBufferArgument('pointsGeneration', 0, 'points');
	gpuHelper.setBufferArgument('pointsGeneration', 1, 'data');
	gpuHelper.setBufferArgument('pointsGeneration', 2, 'normals');
	gpuHelper.setBufferArgument('pointsGeneration', 3, 'size');
    gpuHelper.setBufferArgument('pointsGeneration', 4, 'firstDerivKernel');
    gpuHelper.setBufferArgument('pointsGeneration', 5, 'secondDerivKernel');

	// Temp arrays for moving data around.
	const tempArray3x = new Float32Array(3 * LAYER_LENGTH);
	const tempVector1 = new Vector3();
	const tempVector2 = new Vector3();
	const tempVector3 = new Vector3();

	let numPtsFirstPass = 0;
	// Run on each layer (can't load all normals at once).
    for (let z = 0, zDim = fileParams.DIMENSIONS.z; z < zDim; z++) {
        gpuHelper.copyDataToGPUBuffer('normals', normals.getData(z) as GPUTypedArray);

        // Set arguments.
        gpuHelper.setKernelArgument('pointsGeneration', 6, 'int', z);

        gpuHelper.runProgram('pointsGeneration', LAYER_LENGTH);

        // Get data off GPU.
        gpuHelper.copyDataFromGPUBuffer('points', tempArray3x);
		allPoints.setLayer(z, tempArray3x);

		for (let y = 0, yDim = fileParams.DIMENSIONS.y; y < yDim; y++) {
			for (let x = 0, xDim = fileParams.DIMENSIONS.x; x < xDim; x++) {
				if (allPoints.getVector3(x, y, z, tempVector1) !== null) {
					numPtsFirstPass++;
				}
			}
		}
    }

	log(`\t${numPtsFirstPass} points detected.`);

	// Clear out GPU mem, except points and size buffers.
	gpuHelper.clear(['points', 'size']);



    // Delete pts that are too close to each other.

    // Init gpu program.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/mergePointsByProximityProgram.cl',
		'mergePointsByProximity',
		{
			POINT_DETECTION_MERGE_TOL_SQ: {
				value: POINT_DETECTION_MERGE_TOL * POINT_DETECTION_MERGE_TOL,
				type: 'float32',
			},
		});

	// Init buffers.
	gpuHelper.createGPUBuffer('pointsCurrentLayer', null, 'float*', 'read', LAYER_LENGTH * 3);
	gpuHelper.createGPUBuffer('pointsPrevLayer', null, 'float*', 'read', LAYER_LENGTH * 3);

	// Set kernel arguments.
	gpuHelper.setBufferArgument('mergePointsByProximity', 0, 'points');
	gpuHelper.setBufferArgument('mergePointsByProximity', 1, 'pointsCurrentLayer');
	gpuHelper.setBufferArgument('mergePointsByProximity', 2, 'pointsPrevLayer');
	gpuHelper.setBufferArgument('mergePointsByProximity', 3, 'size');

	let numPtsAfterPruning = 0;
    for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
        gpuHelper.copyDataToGPUBuffer('pointsCurrentLayer', allPoints.getLayer(z, tempArray3x));
        if (z > 0) {
			gpuHelper.copyDataToGPUBuffer('pointsPrevLayer', allPoints.getLayer(z - 1, tempArray3x));
		} else {
			tempArray3x.fill(nullValForType('float32'));
			gpuHelper.copyDataToGPUBuffer('pointsPrevLayer', tempArray3x);
		}

        gpuHelper.runProgram('mergePointsByProximity', LAYER_LENGTH);

        // Get data off GPU.
		gpuHelper.copyDataFromGPUBuffer('points', tempArray3x);
		allPoints.setLayer(z, tempArray3x);
		for (let y = 0, yDim = fileParams.DIMENSIONS.y; y < yDim; y++) {
			for (let x = 0, xDim = fileParams.DIMENSIONS.x; x < xDim; x++) {
				if (allPoints.getVector3(x, y, z, tempVector1) !== null) {
					numPtsAfterPruning++;
				}
			}
		}
    }

    log(`\t${numPtsAfterPruning} points remaining, ${numPtsFirstPass - numPtsAfterPruning} points merged by proximity.`);

	// Some points may be located in the incorrect voxel baed on their position.
	// Index all points to their correct voxel.
	// Do this on cpu to prevent race conditions.
	let numPtsAfterIndexing = 0;
	for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
        for (let y = 0; y < fileParams.DIMENSIONS.y; y++) {
			for (let x = 0; x < fileParams.DIMENSIONS.x; x++) {
				const position = allPoints.getVector3(x, y, z, tempVector1);
				if (position === null) {
					continue;
				}
				const index3D = positionToIndex3D(position, tempVector2, fileParams.DIMENSIONS);
				if (index3D === null) {
					// This point is outside the bounds of the dataset, remove it.
					allPoints.set(x, y, z, null);
					continue;
				}
				if (index3D.x !== x || index3D.y !== y || index3D.z !== z) {
					// Remove point from current voxel.
					allPoints.set(x, y, z, null);
					// Check if target voxel is empty.
					const targetVoxelPoint = allPoints.getVector3(index3D.x, index3D.y, index3D.z, tempVector3);
					if (targetVoxelPoint === null) {
						// Move point to new voxel.
						allPoints.setVector3(index3D.x, index3D.y, index3D.z, position);
						numPtsAfterIndexing++;
					}
				} else {
					// Point is in correct voxel.
					numPtsAfterIndexing++;
				}
			}
		}
	}
	log(`\t${numPtsAfterIndexing} points remaining, ${numPtsAfterPruning - numPtsAfterIndexing} points deleting during re-indexing.`);

	// Lookup that links high points in volume to 1D list allPointsList.
    const allIndices = new BufferedTomDataRWOverwrite(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allIndices', 'int32', fileParams.DIMENSIONS, 1, true);

	// Compile 1D list of all points.
    const allPointsList = new MutableTypedArray(new Float32Array(), false, 3);
    const allNormalsList = new MutableTypedArray(new Float32Array(), false, 3);
    for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
        for (let y = 0; y < fileParams.DIMENSIONS.y; y++) {
            for (let x = 0; x < fileParams.DIMENSIONS.x; x++) {
				const position3D = allPoints.getVector3(x, y, z, tempVector1);
                if (position3D === null) {
                    continue;
				}
				const index3D = positionToIndex3D(position3D, tempVector2, fileParams.DIMENSIONS);
				if (index3D === null) {
					continue;
				}
				// Populate points indices.
				allIndices.set(index3D.x, index3D.y, index3D.z, allPointsList.getLength());
				// Populate points data.
                allPointsList.pushVector3(position3D);
				// Init points normals with normal field vectors to start.
				// We'll compute mesh normals eventually.
                allNormalsList.pushVector3(normals.getVector3(x, y, z, tempVector3));
            }
        }
    }

	// Close all files.
	normals.close();
	allPoints.close();
	allIndices.close();
	allPointsList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allPointsList');
	allPointsList.destroy();
	allNormalsList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allNormalsList');
	allNormalsList.destroy();
	
	// Clear.
    gpuHelper.clear();
    logTime('\tfeature points generation', startTime);
}