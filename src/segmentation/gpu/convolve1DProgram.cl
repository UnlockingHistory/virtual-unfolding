#import "src/common/gpu/utils.cl"

__kernel void convolve1D(
	__global __read_only float *input,
	__global __write_only float *output,
    __global __read_only int *size,
	__global __read_only float *convolutionKernel,
	const int kernelSize,
	const int axis
) {
    const size_t i =  get_global_id(0);
    const int3 index3D = calcIndex3DFromIndex1D(i, size);

    // Compute axis vector for computing convolution.
    int3 offsetVector = { 0, 0, 0 };
    // offsetVector[axis] = 1;
    if (axis == 0) {
        offsetVector.x = 1;
    } else if (axis == 1) {
        offsetVector.y = 1;
    } else {
        offsetVector.z = 1;
    }

    // Compute convolution.
    float convolution = convolutionKernel[kernelSize] * input[i];
    for (int j = 1; j <= kernelSize; j++) {
        convolution += convolutionKernel[kernelSize + j]
			* getValFromIndex3D_NearestBoundary(index3D + offsetVector * j, input, size);
        convolution += convolutionKernel[kernelSize - j]
			* getValFromIndex3D_NearestBoundary(index3D - offsetVector * j, input, size);
    }

    output[i] = convolution;
}