#import "src/common/gpu/utils.cl"

__kernel void orientedBlur(
	__global __read_only float *input,
	__global __write_only float *output,
    __global __read_only float *normals,
	__global __read_only int *size,
	__global __read_only float *convolutionKernel,
    const int zOffset
) {
    const size_t i =  get_global_id(0);
	const int i_global = i + zOffset * size[0] * size[1];

    const float3 normal = { normals[3 * i], normals[3 * i + 1], normals[3 * i + 2] };

	// Get basis vecotrs for blur kernel.
    const float3 w = {0, 0, 1};
    const float3 u = cross(normal, w);
    const float3 v = cross(normal, u);

	// Apply 3D kernel.
    const float3 centerPosition = calcPosition3DFromIndex1D(i_global, size);
    float val = 0;
    for (int j = -BLUR_KERNEL_DIM; j <= BLUR_KERNEL_DIM; j++) {
        const float3 offsetPosition = centerPosition + u * j;
        float offsetVal = 0;
        for (int k = -BLUR_KERNEL_DIM; k <= BLUR_KERNEL_DIM; k++) {
            offsetVal += convolutionKernel[k + BLUR_KERNEL_DIM] * trilinearInterpolation(offsetPosition + v * k, input, size);
        }
        val += offsetVal * convolutionKernel[j + BLUR_KERNEL_DIM];
    }

    output[i_global] = val;
}