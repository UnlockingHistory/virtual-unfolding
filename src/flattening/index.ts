import { performance } from 'perf_hooks';
import { FileParams, FlatteningParams } from '../common/types';
import { addDirectoryIfNeeded, logTime, safeClearDirectory } from '../common/utils';
import { gpuHelper } from '../globals/gpuHelper';
import { Embedding2D } from './Embedding2D';

export default function run(fileParams: FileParams, flatteningParams: FlatteningParams) {

	const startTime = performance.now();

	// Make dir if needed.
	
	if (fileParams.SHOULD_SAVE_ANIMATION) {
		safeClearDirectory(`${fileParams.OUTPUT_PATH}${fileParams.ANIMATION_PATH}`);
		addDirectoryIfNeeded(`${fileParams.OUTPUT_PATH}${fileParams.ANIMATION_PATH}`);
	}

	// Get all constants.
	const {
	} = flatteningParams;
	
	const embedding2D = new Embedding2D(gpuHelper, fileParams, flatteningParams);

    // Clean up.
	gpuHelper.clear();
	
	logTime('\tflattening', startTime);
};
