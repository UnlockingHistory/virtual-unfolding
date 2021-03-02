__kernel void triangleMeshResMask(
	__global __write_only int *highResMask,
	__global __read_only float *barycentrics,
	__global __read_only int *triangles2D,
    __global __read_only float *vertexCurvatures
) {
    const size_t i =  get_global_id(0);

    const int3 triangle = {triangles2D[3*i], triangles2D[3*i + 1], triangles2D[3*i + 2]};
    if (triangle.x == NULL_INT32) {
        return;
    }
    const float3 barycentric = {barycentrics[3*i], barycentrics[3*i + 1], barycentrics[3*i + 2]};

    // Get curvature.
    const float3 curvatures = {
        vertexCurvatures[triangle.x],
        vertexCurvatures[triangle.y],
        vertexCurvatures[triangle.z],
    };
    const float c = dot(curvatures, barycentric);
    if (fabs(c) < 0.01) {
		return;
    }

	// Set mask.
	highResMask[i] = 1;
}
