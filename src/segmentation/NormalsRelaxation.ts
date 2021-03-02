import { BufferedTomDataR } from '../common/BufferedTomDataR';
import GPUHelper from '../common/GPUHelper';
import { performance } from 'perf_hooks';
import { log, logTime } from '../common/utils';
import { FileParams, GPUTypedArray } from '../common/types';
import { copyFileSync, renameSync, unlinkSync } from 'fs';
import { BufferedTomDataW } from '../common/BufferedTomDataW';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		NUM_NORMAL_RELAXATION_STEPS: number,
		NORMAL_RELAX_GAUSS_SCALE: number,
	}>,
) {
	const startTime = performance.now();
	
	// Constants.
	const {
		NUM_NORMAL_RELAXATION_STEPS,
		NORMAL_RELAX_GAUSS_SCALE,
	} = params;
	const LAYER_LENGTH = fileParams.DIMENSIONS.x * fileParams.DIMENSIONS.y;
	// Manually use window size = 1 here because normals relaxation only depends on nearest neighbors with rad = 1.
	// Larger window size is fine, but less efficient.
	const WINDOW_SIZE = 1;
	const WINDOW_SIZE_DERIVS = 0;

    // Load up partial derivatives.
    const rxx = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXX_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);
    const ryy = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYY_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);
    const rzz = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GZZ_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);
    const rxy = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXY_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);
    const ryz = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYZ_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);
    const rxz = new BufferedTomDataR(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXZ_${NORMAL_RELAX_GAUSS_SCALE}X`, WINDOW_SIZE_DERIVS);

	// Place to save computed data.
	const RESPONSES_FILENAME_TEMP = `${fileParams.FILENAME}_responsesRelaxed_temp`;
	const NORMALS_FILENAME_TEMP = `${fileParams.FILENAME}_normalsRelaxed_temp`;
	const RESPONSES_FILENAME = `${fileParams.FILENAME}_responsesRelaxed`;
	const NORMALS_FILENAME = `${fileParams.FILENAME}_normalsRelaxed`;
	copyFileSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_normals.tom`, `${fileParams.OUTPUT_PATH}${NORMALS_FILENAME}.tom`);
	copyFileSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_responses.tom`, `${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME}.tom`);
    const responsesRelaxed = new BufferedTomDataR(fileParams.OUTPUT_PATH, RESPONSES_FILENAME, WINDOW_SIZE);
    const normalsRelaxed = new BufferedTomDataR(fileParams.OUTPUT_PATH, NORMALS_FILENAME, WINDOW_SIZE);
	const responsesRelaxedTemp = new BufferedTomDataW(fileParams.OUTPUT_PATH, RESPONSES_FILENAME_TEMP, 'float32', fileParams.DIMENSIONS, 1, false);
    const normalsRelaxedTemp = new BufferedTomDataW(fileParams.OUTPUT_PATH, NORMALS_FILENAME_TEMP, 'float32', fileParams.DIMENSIONS, 3, false);

    // Init gpu program.
	gpuHelper.initProgram(
		'./src/segmentation/gpu/normalsRelaxationProgram.cl', 
		'normalsRelaxation',
		{
			WINDOW_SIZE: {
				value: WINDOW_SIZE,
				type: 'uint8',
			},
		});

    // Init buffers.
    gpuHelper.createGPUBuffer('nextNormals', null, 'float*', 'write', LAYER_LENGTH * 3);
    gpuHelper.createGPUBuffer('nextResponses', null, 'float*', 'write', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('size', new Int32Array(fileParams.DIMENSIONS.toArray()), 'int*', 'read', 3);
	gpuHelper.createGPUBuffer('normals', null, 'float*', 'read', normalsRelaxed.getArraySize());
	gpuHelper.createGPUBuffer('responses', null, 'float*', 'read', responsesRelaxed.getArraySize());
	gpuHelper.createGPUBuffer('rxx', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('ryy', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rzz', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rxy', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('ryz', null, 'float*', 'read', LAYER_LENGTH);
	gpuHelper.createGPUBuffer('rxz', null, 'float*', 'read', LAYER_LENGTH);

	// Set arguments on relaxation program.
	gpuHelper.setBufferArgument('normalsRelaxation', 0, 'normals');
	gpuHelper.setBufferArgument('normalsRelaxation', 1, 'responses');
	gpuHelper.setBufferArgument('normalsRelaxation', 2, 'rxx');
	gpuHelper.setBufferArgument('normalsRelaxation', 3, 'ryy');
	gpuHelper.setBufferArgument('normalsRelaxation', 4, 'rzz');
	gpuHelper.setBufferArgument('normalsRelaxation', 5, 'rxy');
	gpuHelper.setBufferArgument('normalsRelaxation', 6, 'ryz');
	gpuHelper.setBufferArgument('normalsRelaxation', 7, 'rxz');
    gpuHelper.setBufferArgument('normalsRelaxation', 8, 'nextNormals');
    gpuHelper.setBufferArgument('normalsRelaxation', 9, 'nextResponses');
	gpuHelper.setBufferArgument('normalsRelaxation', 10, 'size');

    for (let i = 0; i < NUM_NORMAL_RELAXATION_STEPS; i++) {
		log(`\t    relaxation iter: ${i}`);
        for (let z = 0; z < fileParams.DIMENSIONS.z; z ++) {
			// Force buffers to move to correct position.
            gpuHelper.copyDataToGPUBuffer('normals', normalsRelaxed.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('responses', responsesRelaxed.getData(z) as GPUTypedArray);
			gpuHelper.copyDataToGPUBuffer('rxx', rxx.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('ryy', ryy.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('rzz', rzz.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('rxy', rxy.getData(z) as GPUTypedArray);
            gpuHelper.copyDataToGPUBuffer('ryz', ryz.getData(z) as GPUTypedArray);
			gpuHelper.copyDataToGPUBuffer('rxz', rxz.getData(z) as GPUTypedArray);

            // Run program.
			gpuHelper.runProgram('normalsRelaxation', LAYER_LENGTH);
			
            // Save data to temp files.
            gpuHelper.copyDataFromGPUBuffer('nextNormals', normalsRelaxedTemp.getData() as GPUTypedArray);
			gpuHelper.copyDataFromGPUBuffer('nextResponses', responsesRelaxedTemp.getData() as GPUTypedArray);
            normalsRelaxedTemp.writeLayer(z);
			responsesRelaxedTemp.writeLayer(z);
		}
		// Flip flop files.
		// This code must stay at the end of the loop.
		if (i%2 === 0) {
			normalsRelaxed.changeFile(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME_TEMP}.tom`);
			responsesRelaxed.changeFile(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME_TEMP}.tom`);
			normalsRelaxedTemp.changeFile(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME}.tom`);
			responsesRelaxedTemp.changeFile(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME}.tom`);
		} else {
			normalsRelaxed.changeFile(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME}.tom`);
			responsesRelaxed.changeFile(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME}.tom`);
			normalsRelaxedTemp.changeFile(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME_TEMP}.tom`);
			responsesRelaxedTemp.changeFile(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME_TEMP}.tom`);
		}
	}

	// Close files.
	rxx.close();
    ryy.close();
    rzz.close();
    rxy.close();
    ryz.close();
    rxz.close();
    normalsRelaxed.close();
    responsesRelaxed.close();
    normalsRelaxedTemp.close();
	responsesRelaxedTemp.close();

	// Do last renaming of files if needed.
	if (NUM_NORMAL_RELAXATION_STEPS % 2 === 1) {
		renameSync(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME_TEMP}.tom`, `${fileParams.OUTPUT_PATH}${NORMALS_FILENAME}.tom`);
		renameSync(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME_TEMP}.tom`, `${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME}.tom`);
	} else {
		// Delete temp files.
		unlinkSync(`${fileParams.OUTPUT_PATH}${RESPONSES_FILENAME_TEMP}.tom`);
		unlinkSync(`${fileParams.OUTPUT_PATH}${NORMALS_FILENAME_TEMP}.tom`);
	}

	// Clear out data from gpu.
    gpuHelper.clear();

	logTime('\tnormals relaxation', startTime);
}