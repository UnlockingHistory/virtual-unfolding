import GPUHelper from '../common/GPUHelper';
import Convolution1D from './Convolution1D';
import { performance } from 'perf_hooks';
import { Axis, FileParams } from '../common/types';
import { makeG0Kernel, makeG1Kernel, makeG2Kernel } from '../common/kernels';
import { unlinkSync } from 'fs';
import { logTime } from '../common/utils';

export default function run(
	gpuHelper: GPUHelper,
	fileParams: FileParams,
	params: Readonly<{
		GAUSS_KERNEL_SIGMA: number,
		NORMAL_RELAX_GAUSS_SCALE: number,
	}>,
) {
	const startTime = performance.now();

	const {
		GAUSS_KERNEL_SIGMA,
		NORMAL_RELAX_GAUSS_SCALE,
	} = params;
	
	const convolution1D = new Convolution1D(gpuHelper);
	
	const G0_KERNEL = makeG0Kernel(GAUSS_KERNEL_SIGMA);
	const G1_KERNEL = makeG1Kernel(GAUSS_KERNEL_SIGMA);
	const G2_KERNEL = makeG2Kernel(GAUSS_KERNEL_SIGMA);
    const KERNEL_LENGTH = G0_KERNEL.length;

	const G0_KERNEL_3X = makeG0Kernel(GAUSS_KERNEL_SIGMA * NORMAL_RELAX_GAUSS_SCALE);
	const G1_KERNEL_3X = makeG1Kernel(GAUSS_KERNEL_SIGMA * NORMAL_RELAX_GAUSS_SCALE);
	const G2_KERNEL_3X = makeG2Kernel(GAUSS_KERNEL_SIGMA * NORMAL_RELAX_GAUSS_SCALE);
    const KERNEL_LENGTH_3X = G0_KERNEL_3X.length;

    // Load original (unclipped) tom data as input.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_raw`, gpuHelper, KERNEL_LENGTH);

    // Do convolutions along z.
    convolution1D.convolve1D(Axis.Z, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussZ`);
    convolution1D.convolve1D(Axis.Z, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussZ`);
    convolution1D.convolve1D(Axis.Z, G2_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussZ`);

    // Convolve Gz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYgaussZ`);
    convolution1D.convolve1D(Axis.Y, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYgaussZ`);
    convolution1D.convolve1D(Axis.Y, G2_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussYgaussZ`);

    // Convolve dGz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYdGaussZ`);
    convolution1D.convolve1D(Axis.Y, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYdGaussZ`);

    // Convolve ddGz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYddGaussZ`);

    // Convolve GzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYgaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GX`);
    convolution1D.convolve1D(Axis.X, G2_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXX`);

    // Convolve dGzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYdGaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GZ`);
    convolution1D.convolve1D(Axis.X, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXZ`);

    // Convolve GzdGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYgaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GY`);
    convolution1D.convolve1D(Axis.X, G1_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXY`);

    // Convolve dGzdGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYdGaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYZ`);

    // Convolve ddGzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYddGaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GZZ`);

    // Convolve GzddGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussYgaussZ`, gpuHelper, KERNEL_LENGTH);
    convolution1D.convolve1D(Axis.X, G0_KERNEL, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYY`);

    // Delete temp files.
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_gaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_dGaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_ddGaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_gaussYgaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_dGaussYgaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_ddGaussYgaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_gaussYdGaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_dGaussYdGaussZ.tom`);
    unlinkSync(fileParams.OUTPUT_PATH + `${fileParams.FILENAME}_gaussYddGaussZ.tom`);

    // Repeat blur operations, this time at blur kernel scaled to NORMAL_RELAX_GAUSS_SCALE.

    // Load clipped tom data as input.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_clipped`, gpuHelper, KERNEL_LENGTH_3X);

    // Do convolutions along z.
    convolution1D.convolve1D(Axis.Z, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.Z, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.Z, G2_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve Gz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.Y, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.Y, G2_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve dGz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.Y, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve ddGz with derivs of y.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.Y, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve GzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GX_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.X, G2_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXX_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve dGzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GZ_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.X, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve GzdGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GY_${NORMAL_RELAX_GAUSS_SCALE}X`);
    convolution1D.convolve1D(Axis.X, G1_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GXY_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve dGzdGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_dGaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve ddGzGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_gaussYddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GZZ_${NORMAL_RELAX_GAUSS_SCALE}X`);

    // Convolve GzddGy with derivs of x.
    convolution1D.setInput(fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_ddGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X`, gpuHelper, KERNEL_LENGTH_3X);
    convolution1D.convolve1D(Axis.X, G0_KERNEL_3X, gpuHelper, fileParams.OUTPUT_PATH, `${fileParams.FILENAME}_GYY_${NORMAL_RELAX_GAUSS_SCALE}X`);

	// Clear gpu buffers and remove refs.
    gpuHelper.clear();

    // Delete temp files.
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_gaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_dGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_ddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_gaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_dGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_ddGaussYgaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_gaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_dGaussYdGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);
    unlinkSync(`${fileParams.OUTPUT_PATH}${fileParams.FILENAME}_gaussYddGaussZ_${NORMAL_RELAX_GAUSS_SCALE}X.tom`);

	logTime('\tgauss convolutions', startTime);
};