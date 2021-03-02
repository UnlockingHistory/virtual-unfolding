import GPUHelper from '../common/GPUHelper';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { FileParams, GPUTypedArray } from '../common/types';
import MutableTypedArray from '../common/MutableTypedArray';
import { getBinLength } from '../common/io';
import { log, nullValForType, positionToIndex3D } from '../common/utils';
import { Vector3 } from 'three';
import { BufferedTomDataRWOverwrite } from '../common/BufferedTomDataRWOverwrite';
import { orderNeighborsCC } from '../common/CalcMeshNormals';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		MAX_NUM_NEIGHBORS: number,
		MESHING_NORMAL_ALIGNMENT_TOL: number,
		MESHING_EDGE_NORMAL_ORTHOG_TOL: number,
		MAX_EDGE_LENGTH: number,
		MESHING_MIN_ANGLE: number,
		MAX_SINGLE_LAYER_WIDTH: number,
		MIN_MESH_COMPONENT_SIZE: number,
	}>,
) {
    console.time('\tmeshing');

	// Constants.
	const {
		MAX_NUM_NEIGHBORS,
		MESHING_NORMAL_ALIGNMENT_TOL,
		MESHING_EDGE_NORMAL_ORTHOG_TOL,
		MAX_EDGE_LENGTH,
		MESHING_MIN_ANGLE,
		MAX_SINGLE_LAYER_WIDTH,
		MIN_MESH_COMPONENT_SIZE,
	} = params;
	const INDICES_WINDOW_SIZE = 1;
	const NUM_POINTS = getBinLength(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allPointsList');

	// Temp objects.
	const tempArray1: number[] = [];
	const tempArray2: number[] = [];
	const tempArray3: number[] = [];
	const tempVector1 = new Vector3();
	const tempVector2 = new Vector3();
	const tempVector3 = new Vector3();
		
	// Load previously computed data.
	const allNormalsList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allNormalsList');
	const allPointsList = MutableTypedArray.initFromFile(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allPointsList');
	const allWidthsMin = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allWidthsMin');
	const allWidthsMax = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allWidthsMax');

	// Count up the number of flagged points from width detection.
	const allFlagsList = new MutableTypedArray(new Uint8Array(allPointsList.getLength()), false, 1);
	let numFlagged = 0;
	for (let i = 0; i < NUM_POINTS; i++) {
		const position3D = allPointsList.getVector3(i, tempVector1);
		if (!position3D) {
			continue;
		}
		const index3D = positionToIndex3D(position3D, tempVector2, fileParams.DIMENSIONS);
		if (!index3D) {
			throw new Error('Out of bounds error.');
		}
		const widthMin = allWidthsMin.get(index3D.x, index3D.y, index3D.z);
		if (widthMin === null) {
			throw new Error('Bad widthMin.');
		}
		const widthMax = allWidthsMax.get(index3D.x, index3D.y, index3D.z);
		if (widthMax === null) {
			throw new Error('Bad widthMax.');
		}
		const width = widthMax - widthMin;
		if (width > MAX_SINGLE_LAYER_WIDTH) {
			numFlagged++;
			allFlagsList.set(i, 1);
		}
	}
	log(`\t${numFlagged} low quality points detected based on widths, ${allPointsList.getLength() - numFlagged} remaining.`);

	// Find coplanar points.
	gpuHelper.initProgram(
		'./src/segmentation/gpu/findCoplanarPointsProgram.cl',
		'findCoplanarPoints',
		{
			WINDOW_SIZE: {
				value: INDICES_WINDOW_SIZE,
				type: 'uint32',
			},
			NUM_NEIGHBORING_CELLS: {
				value: (2 * INDICES_WINDOW_SIZE + 1) * (2 * INDICES_WINDOW_SIZE + 1) * (2 * INDICES_WINDOW_SIZE + 1) - 1,
				type: 'uint32',
			},
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
			MAX_EDGE_LENGTH_SQ: {
				value: MAX_EDGE_LENGTH * MAX_EDGE_LENGTH,
				type: 'float32',
			},
			COS_MESHING_NORMAL_ALIGNMENT_TOL: {
				value: Math.cos(MESHING_NORMAL_ALIGNMENT_TOL),
				type: 'float32',
			},
			COS_MESHING_EDGE_NORMAL_ORTHOG_TOL: {
				value: Math.cos(Math.PI/2 - MESHING_EDGE_NORMAL_ORTHOG_TOL),
				type: 'float32',
			},
		});
	// Set kernel buffers.
	gpuHelper.createGPUBuffer('neighbors', null, 'int*', 'write', NUM_POINTS * MAX_NUM_NEIGHBORS);
	gpuHelper.createGPUBuffer('points', allPointsList.getData() as Float32Array, 'float*', 'read', NUM_POINTS * allPointsList.numElementsPerIndex);
	gpuHelper.createGPUBufferFromTom('indices', fileParams.OUTPUT_PATH, fileParams.FILENAME + '_allIndices', 'read');
	gpuHelper.createGPUBuffer('normals', allNormalsList.getData() as Float32Array, 'float*', 'read', NUM_POINTS * allNormalsList.numElementsPerIndex);
	gpuHelper.createGPUBuffer('flags', allFlagsList.getData() as Uint8Array, 'uchar*', 'read', NUM_POINTS * allFlagsList.numElementsPerIndex);
	gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read');

	// Set neighbors to null.
	gpuHelper.nullBuffer('neighbors');

	// Set kernel arguments.
	gpuHelper.setBufferArgument('findCoplanarPoints', 0, 'neighbors');
    gpuHelper.setBufferArgument('findCoplanarPoints', 1, 'points');
	gpuHelper.setBufferArgument('findCoplanarPoints', 2, 'indices');
	gpuHelper.setBufferArgument('findCoplanarPoints', 3, 'normals');
	gpuHelper.setBufferArgument('findCoplanarPoints', 4, 'flags');
	gpuHelper.setBufferArgument('findCoplanarPoints', 5, 'size');

	// Run program.
	gpuHelper.runProgram('findCoplanarPoints', NUM_POINTS);

	// Copy data off GPU.
	const allNeighbors = gpuHelper.mutableTypedArrayFromGPUBuffer('neighbors', 'int32', true, MAX_NUM_NEIGHBORS)

    // Remove any neighboring points that are not reciprocal.
	let numBadNeighbors = 0;
    for (let i = 0; i < NUM_POINTS; i++) {
		const pointNeighbors = allNeighbors.get(i, tempArray1);
        if (!pointNeighbors) {
            continue;
        }
        let needsUpdate = false;
        for (let j = pointNeighbors.length - 1; j >= 0; j--) {
            const neighborNeighbors = allNeighbors.get(pointNeighbors[j], tempArray2);
            if (neighborNeighbors === null || neighborNeighbors.indexOf(i) < 0) {
                pointNeighbors.splice(j, 1);
                numBadNeighbors++;
                needsUpdate = true;
            }
        }
        if (needsUpdate) {
            allNeighbors.set(i, pointNeighbors);
		}
    }
    if (numBadNeighbors) {
        log(`\t${numBadNeighbors} invalid neighbors pruned.`);
	}

	// Mesh with neighbors - this is not parallelized for now.
	const COS_MESHING_MIN_ANGLE = Math.cos(MESHING_MIN_ANGLE);
    const allMeshNeighbors = new MutableTypedArray(new Int32Array(allNeighbors.getLength() * allNeighbors.numElementsPerIndex), true, MAX_NUM_NEIGHBORS);
    allMeshNeighbors.clear();
    for (let i = 0; i < NUM_POINTS; i++) {
        const pointNeighbors = allNeighbors.get(i, tempArray1);
        if (!pointNeighbors) continue;
        let pointMeshNeighbors = allMeshNeighbors.get(i, tempArray2) as number[];
        if (!pointMeshNeighbors) {
            pointMeshNeighbors = [];
		}
		const pointPosition = allPointsList.getVector3(i, tempVector1);
		if (!pointPosition) {
			return;
		}
        pointNeighbors.forEach(neighborIndex => {
            if (neighborIndex < i) {
                // This neighbor has already been checked.
                return;
            }
            // Check that adding this edge doesn't violate minMeshAngle for either point.
			const neighborPosition = allPointsList.getVector3(neighborIndex, tempVector2);
			if (!neighborPosition) {
				return;
			}
            let edgeVector1 = (tempVector3.copy(neighborPosition).sub(pointPosition)).normalize();
            // Check against all of pointMeshNeighbors.
            for (let j = 0; j < pointMeshNeighbors.length; j++) {
				const neighbor2Position = allPointsList.getVector3(pointMeshNeighbors[j], tempVector2);
				if (!neighbor2Position) {
					return;
				}
                const edgeVector2 = neighbor2Position.sub(pointPosition).normalize();
                if (edgeVector1.dot(edgeVector2) > COS_MESHING_MIN_ANGLE) {
                    return;
                }
            }
            let neighborMeshNeighbors = allMeshNeighbors.get(neighborIndex, tempArray3);
            if (neighborMeshNeighbors === null) {
                neighborMeshNeighbors = [];
            }
            edgeVector1 = edgeVector1.multiplyScalar(-1);
            // Check against all of neighborMeshNeighbors.
            for (let j = 0; j < neighborMeshNeighbors.length; j++) {
				const neighbor2Position = allPointsList.getVector3(neighborMeshNeighbors[j], tempVector2);
				if (!neighbor2Position) {
					return;
				}
                const edgeVector2 = neighbor2Position.sub(neighborPosition).normalize();
                if (edgeVector1.dot(edgeVector2) > COS_MESHING_MIN_ANGLE) {
                    return;
                }
            }
            // Add new edge.
            neighborMeshNeighbors.push(i);
            pointMeshNeighbors.push(neighborIndex);
            allMeshNeighbors.set(neighborIndex, neighborMeshNeighbors);
        });
        allMeshNeighbors.set(i, pointMeshNeighbors);
    }
	allNeighbors.destroy();
	
    // Prune away any points with less than 3 neighbors.
    let underConnectedPoints = 0;
    for (let i = 0; i < NUM_POINTS; i++) {
		// Ignore flagged points.
        const flag = allFlagsList.get(i);
        if (flag) {
            continue;
		}
		// All points must have at least 3 neighbors.
        const neighbors = allMeshNeighbors.get(i, tempArray1);
        if (!neighbors || neighbors.length < 3) {
			allFlagsList.set(i, 1);
			if (neighbors) {
				// Remove point i from neighbors.
				for (let j = 0; j < neighbors.length; j++) {
					const neighbor = neighbors[j];
					const neighborNeighbors = allMeshNeighbors.get(neighbor, tempArray2);
					neighborNeighbors?.splice(neighborNeighbors.indexOf(i), 1);
					allMeshNeighbors.set(neighbor, neighborNeighbors);
				}
			}
			allMeshNeighbors.set(i, null);
			underConnectedPoints++;
			numFlagged++;
        }
	}
	for (let i = 0; i < NUM_POINTS; i++) {
		// Ignore flagged points.
		const flag = allFlagsList.get(i);
		if (flag) {
            continue;
        }
        const neighbors = allMeshNeighbors.get(i, tempArray1);
        if (!neighbors) {
			// It's possible that we could create some stray points in the last step, prune these if needed.
			allFlagsList.set(i, 1);
			underConnectedPoints++;
			numFlagged++;
		}
	}
	log(`\t${underConnectedPoints} low quality points detected based mesh connectivity, ${allPointsList.getLength() - numFlagged} remaining.`);

    // Calc connected components.
	const allMeshNumbers = new MutableTypedArray(new Int32Array(NUM_POINTS), true);
	allMeshNumbers.clear();
    for (let i = 0; i < NUM_POINTS; i++) {
		// Give every point a unique number to start.
        if (!allFlagsList.get(i)) {
            allMeshNumbers.set(i, i);
        }
	}
    // Iteratively propagate mesh numbers across mesh.
    // Init gpu programs.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/connectedComponentsProgram.cl',
		'iterConnections',
		{
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
	});
	gpuHelper.initProgram(
		'./src/segmentation/gpu/connectedComponentsProgram.cl',
		'findNeighborMeshNums',
		{
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
	});
	gpuHelper.createGPUBuffer('meshNeighbors', allMeshNeighbors.getData() as Int32Array, 'int*', 'read', NUM_POINTS * allMeshNeighbors.numElementsPerIndex);
    gpuHelper.createGPUBuffer('meshNumbers', allMeshNumbers.getData() as Int32Array, 'int*', 'readwrite', NUM_POINTS);
    // Init adjacent mesh lookup as all nulls.
	gpuHelper.createGPUBuffer('adjacentMeshNumbers', null, 'int*', 'readwrite', NUM_POINTS);
	gpuHelper.nullBuffer('adjacentMeshNumbers');
    // Set arguments.
    gpuHelper.setBufferArgument('iterConnections', 0, 'meshNumbers');
    gpuHelper.setBufferArgument('iterConnections', 1, 'meshNeighbors');
    gpuHelper.setBufferArgument('findNeighborMeshNums', 0, 'adjacentMeshNumbers');
    gpuHelper.setBufferArgument('findNeighborMeshNums', 1, 'meshNumbers');
    gpuHelper.setBufferArgument('findNeighborMeshNums', 2, 'meshNeighbors');
	const adjacentMeshNumbers = allMeshNumbers.clone();
	adjacentMeshNumbers.clear();
    let finished = false;
    let numIter = 0;
    do {
        for (let i = 0; i < 100; i++) {
            gpuHelper.runProgram('iterConnections', NUM_POINTS);
		}
		numIter += 100;
		// Set adjacentMeshNumbers array to null.
		gpuHelper.nullBuffer('adjacentMeshNumbers');
		// Find neighboring regions.
        gpuHelper.runProgram('findNeighborMeshNums', NUM_POINTS);
        gpuHelper.copyDataFromGPUBuffer('adjacentMeshNumbers', adjacentMeshNumbers.getData() as Int32Array, 0, NUM_POINTS);
        finished = true;
        for (let i = 0; i < NUM_POINTS; i++) {
            if (adjacentMeshNumbers.get(i) !== null) {
                finished = false;
                break;
            }
        }
    } while (!finished);
	gpuHelper.copyDataFromGPUBuffer('meshNumbers', allMeshNumbers.getData() as Int32Array, 0, NUM_POINTS);
    // Find all connected components.
    const components: {[key: string]: number} = {};
    for (let i = 0; i < NUM_POINTS; i++) {
        const num = allMeshNumbers.get(i);
        if (num !== null) {
            if (!components[num]) {
                components[num] = 1;
            } else {
                components[num]++;
            }
        }
    }
    log(`\t${Object.keys(components).length} components found in ${numIter} iterations.`);

	// Remove any small components.
	let smallComponentPts = 0;
	let smallComponents = 0;
    for (let i = 0; i < NUM_POINTS; i++) {
        const meshNum = allMeshNumbers.get(i);
        if (meshNum === null) {
            continue;
        }
        if (components[meshNum] >= MIN_MESH_COMPONENT_SIZE) {
            continue;
        }
        // Flag this point for removal.
		allFlagsList.set(i, 1);
		allMeshNumbers.set(i, null);
		allMeshNeighbors.set(i, null);
		smallComponentPts++;
		numFlagged++;
    }
    Object.keys(components).forEach(key => {
        if (components[key] < MIN_MESH_COMPONENT_SIZE) {
			delete components[key];
			smallComponents++;
        }
	});
	log(`\t${smallComponentPts} points on ${smallComponents} small mesh components removed, ${allPointsList.getLength() - numFlagged} remaining.`);
	log(`\t${Object.keys(components).length} components remaining after removing small components.`);

	// Reindex all mesh numbers to remove any missing numbers.
	// IE the numbers should read: 0, 1, 2, 3...
	const meshNumberReindexLookup = new MutableTypedArray(new Float32Array(NUM_POINTS), true);
	meshNumberReindexLookup.clear();
	// Mark all valid mesh numbers with 1.
	for (let i = 0; i < NUM_POINTS; i++) {
		const meshNum = allMeshNumbers.get(i);
        if (meshNum === null) {
            continue;
		}
		meshNumberReindexLookup.set(meshNum, 1);
	}
	// Generate a new index for each mesh number.
	let newIndex = 0;
	for (let i = 0; i < NUM_POINTS; i++) {
        if (meshNumberReindexLookup.get(i) === null) {
            continue;
		}
		meshNumberReindexLookup.set(i, newIndex);
		newIndex++;
	}
	// Update mesh numbers.
	for (let i = 0; i < NUM_POINTS; i++) {
        const meshNum = allMeshNumbers.get(i);
        if (meshNum === null) {
            continue;
		}
		const newMeshNum = meshNumberReindexLookup.get(meshNum);
		allMeshNumbers.set(i, newMeshNum);
	}

	// Print largest component sizes.
    let numLargeComponents = 10;
    if (Object.keys(components).length < 10) {
        numLargeComponents = Object.keys(components).length;
    }
    const largestComponents: {[key: string]: number} = {};
    let smallestOfLargestComponentsSize = Infinity;
    let smallestOfLargestComponentsKey: string | null = null;
    Object.keys(components).forEach(key => {
        if (Object.values(largestComponents).length < numLargeComponents) {
            largestComponents[key] = components[key];
            if (components[key] < smallestOfLargestComponentsSize) {
                smallestOfLargestComponentsSize = components[key];
                smallestOfLargestComponentsKey = key;
            }
            return;
        }
        if (components[key] > smallestOfLargestComponentsSize) {
            delete largestComponents[smallestOfLargestComponentsKey!];
            largestComponents[key] = components[key];
            // Calc next smallest.
            smallestOfLargestComponentsSize = Infinity;
            Object.keys(largestComponents).forEach(largeComponentKey => {
                if (components[largeComponentKey] < smallestOfLargestComponentsSize) {
                    smallestOfLargestComponentsSize = components[largeComponentKey];
                    smallestOfLargestComponentsKey = largeComponentKey;
                }
            });
        }
    });
    // Sort largest components.
    const sortedLargestComponents = Object.keys(largestComponents).map(key => [meshNumberReindexLookup.get(parseInt(key)), largestComponents[key]]);
    sortedLargestComponents.sort((a, b) => {
        return (b[1] as number) - (a[1] as number);
    });
    sortedLargestComponents.forEach(comp => {
        log(`\t   Mesh ${comp[0]}:\t\t${comp[1]} vertices`);
    });

  	// Split all points into points and flagged points.
	const pointsList = new MutableTypedArray(new Float32Array(), false, 3);
	const meshNeighborsList = new MutableTypedArray(new Int32Array(), true, MAX_NUM_NEIGHBORS);
	const meshNumbersList = new MutableTypedArray(new Int32Array(), false);
	const normalsList = new MutableTypedArray(new Float32Array(), false, 3);
	const widthsMinList = new MutableTypedArray(new Float32Array(), false);
	const widthsMaxList = new MutableTypedArray(new Float32Array(), false);
	const indices = new BufferedTomDataRWOverwrite(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_indices', 'int32', fileParams.DIMENSIONS, 1, true, 0);
	// Mapping from allPointsList to pointsList indices.
	const pointsIndexMapping = new MutableTypedArray(new Int32Array(), true);
	const pointsList_FLAGGED = new MutableTypedArray(new Float32Array(), false, 3);
	const normalsList_FLAGGED = new MutableTypedArray(new Float32Array(), false, 3);
	const widthsMinList_FLAGGED = new MutableTypedArray(new Float32Array(), false);
	const widthsMaxList_FLAGGED = new MutableTypedArray(new Float32Array(), false);
	const indices_FLAGGED = new BufferedTomDataRWOverwrite(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_indices_FLAGGED', 'int32', fileParams.DIMENSIONS, 1, true, 0);
	for (let i = 0; i < NUM_POINTS; i++) {
		pointsIndexMapping.push(null);
		const position3D = allPointsList.getVector3(i, tempVector1);
		if (!position3D) {
			continue;
		}
		const index3D = positionToIndex3D(position3D, tempVector2, fileParams.DIMENSIONS);
		if (!index3D) {
			throw new Error('Out of bounds error.');
		}
		const widthMin = allWidthsMin.get(index3D.x, index3D.y, index3D.z);
		if (widthMin === null) {
			throw new Error('Bad widthMin.');
		}
		const widthMax = allWidthsMax.get(index3D.x, index3D.y, index3D.z);
		if (widthMax === null) {
			throw new Error('Bad widthMax.');
		}
		const flag = allFlagsList.get(i);
		if (flag) {
			widthsMinList_FLAGGED.push(widthMin);
			widthsMaxList_FLAGGED.push(widthMax);
			indices_FLAGGED.set(index3D.x, index3D.y, index3D.z, pointsList_FLAGGED.getLength());
			pointsList_FLAGGED.pushVector3(allPointsList.getVector3(i, tempVector3));
			normalsList_FLAGGED.pushVector3(allNormalsList.getVector3(i, tempVector3));
		} else {
			pointsIndexMapping.set(i, pointsList.getLength());
			meshNeighborsList.push(allMeshNeighbors.get(i, tempArray1));
			meshNumbersList.push(allMeshNumbers.get(i));
			widthsMinList.push(widthMin);
			widthsMaxList.push(widthMax);
			indices.set(index3D.x, index3D.y, index3D.z, pointsList.getLength());
			pointsList.pushVector3(allPointsList.getVector3(i, tempVector3));
			normalsList.pushVector3(allNormalsList.getVector3(i, tempVector3));
		}
	}
	// Reindex all neighbors.
	for (let i = 0, length = meshNeighborsList.getLength(); i < length; i++) {
		const neighbors = meshNeighborsList.get(i, tempArray1);
		if (neighbors === null) {
			continue;
		}
		for (let j = 0; j < neighbors.length; j++) {
			const index = pointsIndexMapping.get(neighbors[j]);
			if (index === null) {
				throw new Error('Bad neighbor index found.');
			}
			neighbors[j] = index;
		}
		meshNeighborsList.set(i, neighbors);
	}
	log(`\tA total of ${pointsList_FLAGGED.getLength()} low quality points removed, ${pointsList.getLength()} remaining.`);

	// Finally reorder all neighbors so that they are in CC order around point relative to normal.
	gpuHelper.createGpuBufferFromMutableTypedArray('points', pointsList, 'read', pointsList.getLength(), true);
	gpuHelper.createGpuBufferFromMutableTypedArray('normals', normalsList, 'read', pointsList.getLength(), true);
	gpuHelper.createGpuBufferFromMutableTypedArray('meshNeighbors', meshNeighborsList, 'readwrite', meshNeighborsList.getLength(), true);
	orderNeighborsCC(gpuHelper, {
		pointsBufferName: 'points',
		neighborsBufferName: 'meshNeighbors',
		normalsBufferName: 'normals',
	}, pointsList.getLength(), MAX_NUM_NEIGHBORS);
	gpuHelper.copyDataToMutableTypedArray('meshNeighbors', meshNeighborsList);

	// Save files.
	pointsList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_points3DList');
	normalsList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_normalsList');
	widthsMinList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_widthsMinList');
	widthsMaxList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_widthsMaxList');
	pointsList_FLAGGED.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_points3DList_FLAGGED');
	normalsList_FLAGGED.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_normalsList_FLAGGED');
	widthsMinList_FLAGGED.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_widthsMinList_FLAGGED');
	widthsMaxList_FLAGGED.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_widthsMaxList_FLAGGED');
	meshNeighborsList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_meshNeighborsList');
	meshNumbersList.saveAsBin(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_meshNumbersList');

	// Close all files.
	allWidthsMin.close();
	allWidthsMax.close();
	allPointsList.destroy();
	allNormalsList.destroy();
	allFlagsList.destroy();
	allMeshNeighbors.destroy();
	allMeshNumbers.destroy();

	indices.close();
	pointsList.destroy();
	normalsList.destroy();
	widthsMinList.destroy();
	widthsMaxList.destroy();

	indices_FLAGGED.close();
	pointsList_FLAGGED.destroy();
	normalsList_FLAGGED.destroy();
	widthsMinList_FLAGGED.destroy();
	widthsMaxList_FLAGGED.destroy();

	meshNeighborsList.destroy();
	meshNumbersList.destroy();

    gpuHelper.clear();
    console.timeEnd('\tmeshing');
};