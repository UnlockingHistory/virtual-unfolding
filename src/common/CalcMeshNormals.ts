import GPUHelper from './GPUHelper';

export function orderNeighborsCC(gpuHelper: GPUHelper, bufferNames: {
	pointsBufferName: string,
	neighborsBufferName: string,
	normalsBufferName: string
}, numPoints: number, MAX_NUM_NEIGHBORS: number) {
	// Init gpu program.
	if (!gpuHelper.gpuProgramExists('orderNeighbors')) {
		gpuHelper.initProgram('./src/segmentation/gpu/orderNeighborsProgram.cl', 'orderNeighbors', {
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
		});
	}

	// Set arguments.
	gpuHelper.setBufferArgument('orderNeighbors', 0, bufferNames.pointsBufferName);
	gpuHelper.setBufferArgument('orderNeighbors', 1, bufferNames.normalsBufferName);
	gpuHelper.setBufferArgument('orderNeighbors', 2, bufferNames.neighborsBufferName);

	// Run
	gpuHelper.runProgram('orderNeighbors', numPoints);
}

export function calcMeshNormals(gpuHelper: GPUHelper, bufferNames: {
	pointsBufferName: string,
	neighborsBufferName: string,
	normalsBufferName: string
	meshNormalsBufferName: string,
}, numPoints: number, MAX_NUM_NEIGHBORS: number, SHOULD_ORDER_NEIGHBORS = false) {
	// Order neighbors.
	if (SHOULD_ORDER_NEIGHBORS) {
		orderNeighborsCC(gpuHelper, bufferNames, numPoints, MAX_NUM_NEIGHBORS);
	}

	// Init gpu program.
	if (!gpuHelper.gpuProgramExists('calcMeshNormals')) {
		gpuHelper.initProgram('./src/common/gpu/calcMeshNormalsProgram.cl', 'calcMeshNormals', {
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
		});
	}
	
	// Set arguments.
	gpuHelper.setBufferArgument('calcMeshNormals', 0, bufferNames.pointsBufferName);
	gpuHelper.setBufferArgument('calcMeshNormals', 1, bufferNames.normalsBufferName);
    gpuHelper.setBufferArgument('calcMeshNormals', 2, bufferNames.neighborsBufferName);
	gpuHelper.setBufferArgument('calcMeshNormals', 3, bufferNames.meshNormalsBufferName);
	
    // Run.
    gpuHelper.runProgram('calcMeshNormals', numPoints);
}

export function calcMeshNormals2D(gpuHelper: GPUHelper, bufferNames: {
	pointsBufferName: string,
	neighborsBufferName: string,
	meshNormalsBufferName: string,
}, numPoints: number, MAX_NUM_NEIGHBORS: number) {
	
	// Init gpu programs.
	if (!gpuHelper.gpuProgramExists('calcMeshNormals2D')) {
		gpuHelper.initProgram('./src/common/gpu/calcMeshNormalsProgram.cl', 'calcMeshNormals2D', {
			MAX_NUM_NEIGHBORS: {
				value: MAX_NUM_NEIGHBORS,
				type: 'uint32',
			},
		});
	}
	
	// Set arguments.
	gpuHelper.setBufferArgument('calcMeshNormals2D', 0, bufferNames.pointsBufferName);
    gpuHelper.setBufferArgument('calcMeshNormals2D', 1, bufferNames.neighborsBufferName);
	gpuHelper.setBufferArgument('calcMeshNormals2D', 2, bufferNames.meshNormalsBufferName);
	
    // Run.
    gpuHelper.runProgram('calcMeshNormals2D', numPoints);
}