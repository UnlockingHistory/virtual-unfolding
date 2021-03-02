// import GPUHelper from '../common/GPUHelper';
// import { FileParams } from '../common/types';
// import { performance } from 'perf_hooks';
// import { logTime } from '../common/utils';
// import { readVol } from '../common/io';
// import { saveBMP } from '../common/BmpWriter';

// function commonSetup(gpuHelper: GPUHelper, fileParams: FileParams) {
// 	const positions3D = readVol(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_grown_pts3D`, 'float32');
// 	// Add data to gpu.
// 	gpuHelper.createGPUBuffer('positions3D', positions3D as Float32Array, 'float*', 'read', positions3D.length);
// 	gpuHelper.createGPUBuffer('positions3DHash', null, 'uchar*', 'write', fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y * fileParams.DIMENSIONS.z);
// 	gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read', 3);

// 	// Set positions3DHash to 0.
// 	gpuHelper.zeroBuffer('positions3DHash');

// 	// Hash positions3D.
// 	gpuHelper.initProgram('./src/visualization/gpu/hashMeshPositions.cl', 'hashMeshPositions');
// 	gpuHelper.setBufferArgument('hashMeshPositions', 0, 'positions3D');
// 	gpuHelper.setBufferArgument('hashMeshPositions', 1, 'positions3DHash');
// 	gpuHelper.setBufferArgument('hashMeshPositions', 2, 'size');
// 	gpuHelper.runProgram('hashMeshPositions', positions3D.length / 3);
// }

// export function flattenLayersAlongY(gpuHelper: GPUHelper, fileParams: FileParams, opacity: number) {
// 	const startTime = performance.now();

// 	commonSetup(gpuHelper, fileParams);

//     gpuHelper.initProgram('./src/visualization/gpu/flattenUchar.cl', 'flattenAlongY');

// 	// Get width and height.
// 	const width = fileParams.DIMENSIONS.x;
// 	const height = fileParams.DIMENSIONS.z;

//     // Init gpu buffers.
// 	gpuHelper.createGPUBuffer('output', null, 'uchar*', 'write', width * height);
// 	gpuHelper.createGPUBuffer('size', Int32Array.from(fileParams.DIMENSIONS.toArray()), 'int*', 'read', 3);

//     // Set arguments.
//     gpuHelper.setBufferArgument('flattenAlongY', 0, 'positions3DHash');
//     gpuHelper.setBufferArgument('flattenAlongY', 1, 'output');
// 	gpuHelper.setKernelArgument('flattenAlongY', 2, 'float', opacity);
// 	gpuHelper.setBufferArgument('flattenAlongY', 3, 'size');

//     // Run.
//     gpuHelper.runProgram('flattenAlongY', width * height);

// 	// Save.
// 	const output = new Uint8Array(width * height);
//     gpuHelper.copyDataFromGPUBuffer('output', output);
// 	saveBMP(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_xray_layers_Y', output, width, height, 1);

//     gpuHelper.clear();

// 	logTime('\tflatten layer data along z', startTime);
// }