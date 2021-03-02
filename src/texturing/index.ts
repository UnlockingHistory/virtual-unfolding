import { existsSync } from 'fs';
import { performance } from 'perf_hooks';
import { FileParams, TexturingParams } from '../common/types';
import { logTime, log } from '../common/utils';
import { gpuHelper } from '../globals/gpuHelper';
import TextureMap from './TextureMap';

export default function run(fileParams: FileParams, texturingParams: TexturingParams) {
	const startTime = performance.now();

	const textureMap = new TextureMap(fileParams, texturingParams);

	const maxMeshNum = textureMap.getMaxMeshNum();
	
	// Calc sizes of all final frames
    const bounds = textureMap.calcAllBounds(texturingParams.PADDING);
    console.log('\tTexture bounds calculated.\n');
    
    for (let currentMeshNum = 0; currentMeshNum <= maxMeshNum; currentMeshNum++) {
		if (!bounds[currentMeshNum]) {
			continue;
		}
        // textureMap.saveStrainTexture(fileParams, texturingParams, currentMeshNum, bounds[currentMeshNum]);
		// textureMap.saveIterMappedTexture(fileParams, texturingParams, currentMeshNum, bounds[currentMeshNum]);

		// // Save two copies of the creases pattern, one is inverted from the other.
		textureMap.saveCreasePattern(fileParams, texturingParams, currentMeshNum, false, bounds[currentMeshNum]);
		// textureMap.saveCreasePattern(fileParams, texturingParams, currentMeshNum, true, bounds[currentMeshNum]);

		textureMap.saveGreyscaleTexture(fileParams.OUTPUT_PATH, fileParams.FILENAME, texturingParams, currentMeshNum, false, bounds[currentMeshNum]);
		// if (texturingParams.Z_OFFSET !== 0) {
		// 	// If we are using a z-offset, also save the reverse offset image.
		// 	textureMap.saveGreyscaleTexture(fileParams.OUTPUT_PATH, fileParams.FILENAME, texturingParams, currentMeshNum, true, bounds[currentMeshNum]);
		// }

        console.log(`\tMesh ${currentMeshNum} textures saved.\n`);
	}

	if (fileParams.SHOULD_SAVE_ANIMATION) {
		// Then create texture sequence.
		let iterNum = 0;
		while(true) {
			const positionsPath = `${fileParams.OUTPUT_PATH}${fileParams.ANIMATION_PATH}${fileParams.FILENAME}_points2DList_frame${iterNum}.bin`;
			if (!existsSync(positionsPath)) {
				break;
			}
			// Update positions.
			// TODO: update mesh numbers as well eventually.
			textureMap.updatePositions(positionsPath);

			log(`\tsaving frame ${iterNum}`);

			// Run this only for the largest mesh.
			const largestMesh = 0;
			textureMap.saveGreyscaleTexture(`${fileParams.OUTPUT_PATH}${fileParams.ANIMATION_PATH}`, `${fileParams.FILENAME}_frame${iterNum}`, texturingParams, largestMesh, false, bounds[largestMesh]);
			iterNum++;
		}
	}

	textureMap.destroy();

	gpuHelper.clear();
	
	logTime('\ttexturing', startTime);
}

