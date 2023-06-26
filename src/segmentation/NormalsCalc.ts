import GPUHelper from '../common/GPUHelper';
import { BufferedTomDataR } from '../common/BufferedTomDataR';
import { performance } from 'perf_hooks';
import { FileParams, GPUTypedArray } from '../common/types';
import { logTime } from '../common/utils';
import { BufferedTomDataW } from '../common/BufferedTomDataW';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
) {
    const startTime = performance.now();

    // Init gpu program.
    gpuHelper.initProgram(
		'./src/segmentation/gpu/normalsCalcProgram.cl',
		'normalsCalc',
	);
	// Manually use window size = 0 here because normals calc does not depend on neighboring layers.
	// Larger window size is fine, but less efficient wrt read/writes.
	const WINDOW_SIZE = 0;

    // Load up partial derivatives.
    const rxx = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GXX', WINDOW_SIZE);
    const ryy = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GYY', WINDOW_SIZE);
    const rzz = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GZZ', WINDOW_SIZE);
    const rxy = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GXY', WINDOW_SIZE);
    const ryz = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GYZ', WINDOW_SIZE);
    const rxz = new BufferedTomDataR(fileParams.OUTPUT_PATH, fileParams.FILENAME + '_GXZ', WINDOW_SIZE);

	// Create space to save data.
    const responses = new BufferedTomDataW(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_responses`, 'float32', fileParams.DIMENSIONS, 1, false);
    const normals = new BufferedTomDataW(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_normals`, 'float32', fileParams.DIMENSIONS, 3, false);

    // Create GPU buffers.
    const LAYER_LENGTH = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y;
    gpuHelper.createGPUBuffer('responses', null, 'float*', 'write', LAYER_LENGTH);
    gpuHelper.createGPUBuffer('normals', null, 'float*', 'write', LAYER_LENGTH * 3);
	gpuHelper.createGPUBuffer('rxx', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('ryy', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rzz', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rxy', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('ryz', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rxz', null, 'float*', 'read', LAYER_LENGTH);

	// Set arguments.
	gpuHelper.setBufferArgument('normalsCalc', 0, 'normals');
	gpuHelper.setBufferArgument('normalsCalc', 1, 'responses');
	gpuHelper.setBufferArgument('normalsCalc', 2, 'rxx');
	gpuHelper.setBufferArgument('normalsCalc', 3, 'ryy');
	gpuHelper.setBufferArgument('normalsCalc', 4, 'rzz');
	gpuHelper.setBufferArgument('normalsCalc', 5, 'rxy');
	gpuHelper.setBufferArgument('normalsCalc', 6, 'ryz');
	gpuHelper.setBufferArgument('normalsCalc', 7, 'rxz');

    for (let z = 0; z < fileParams.DIMENSIONS.z; z++) {
        // Put partials on GPU.
        gpuHelper.copyDataToGPUBuffer('rxx', rxx.getData(z) as GPUTypedArray);
        gpuHelper.copyDataToGPUBuffer('ryy', ryy.getData(z) as GPUTypedArray);
        gpuHelper.copyDataToGPUBuffer('rzz', rzz.getData(z) as GPUTypedArray);
        gpuHelper.copyDataToGPUBuffer('rxy', rxy.getData(z) as GPUTypedArray);
        gpuHelper.copyDataToGPUBuffer('ryz', ryz.getData(z) as GPUTypedArray);
        gpuHelper.copyDataToGPUBuffer('rxz', rxz.getData(z) as GPUTypedArray);
        
        // Run program.
        gpuHelper.runProgram('normalsCalc', LAYER_LENGTH);

        // Save results.
		
        gpuHelper.copyDataFromGPUBuffer('normals', normals.getData() as GPUTypedArray);
		gpuHelper.copyDataFromGPUBuffer('responses', responses.getData() as GPUTypedArray);

		const normalsArray = normals.getData() as GPUTypedArray;
		const responsesArray = responses.getData() as GPUTypedArray;
		// TODO: sometimes normals calc is returning NaN.  This is a temporary fix.
		for (let i = 0, len = responsesArray.length; i < len; i++) {
			if (isNaN(responsesArray[i]) || isNaN(normalsArray[3 * i]) || isNaN(normalsArray[3 * i + 1]) || isNaN(normalsArray[3 * i + 2])) {
				normalsArray[3 * i] = 1;
				normalsArray[3 * i + 1] = 0;
				normalsArray[3 * i + 2] = 0;
				responsesArray[i] = 0;
				const x = i % fileParams.DIMENSIONS.x;
				const y = Math.floor(i / fileParams.DIMENSIONS.x) % fileParams.DIMENSIONS.y;
				console.log(`Caught NaN in normals/responses array at index (${x}, ${y}, ${z}), setting to zero (TODO: fix this in GPU code).`);
			}
		}

        normals.writeLayer(z);
        responses.writeLayer(z);
    }

    // Close all files.
    rxx.close();
    ryy.close();
    rzz.close();
    rxy.close();
    ryz.close();
    rxz.close();
    responses.close();
    normals.close();

	gpuHelper.clear();
	
	logTime('\tnormals calculation', startTime);
}