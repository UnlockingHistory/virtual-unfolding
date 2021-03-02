// Creates crease pattern from curvature values.

__kernel void creasePattern(
	__global __write_only uchar *image,
	__global __read_only float *vertexCurvatures,
    __global __read_only float *barycentrics,
	__global __read_only int *triangles2D,
	const float scalingFactor,
	const int gridSizeX
) {
    const size_t i =  get_global_id(0);

	// Calc image position.
    const int imageWidth = gridSizeX * TEXTURING_SCALE;
    const int2 imagePosition2D = { i % imageWidth, i / imageWidth };

    // Calc grid index.
    const int2 gridIndex2D = imagePosition2D / TEXTURING_SCALE;
    const int gridIndex = gridIndex2D.y * gridSizeX + gridIndex2D.x;

    const int3 triangle = {triangles2D[3*gridIndex], triangles2D[3*gridIndex + 1], triangles2D[3*gridIndex + 2]};
    if (triangle.x == NULL_INT32) {
        return;
    }

    // Lookup barycentric coordinates.
    const float3 barycentric = {barycentrics[3*i], barycentrics[3*i + 1], barycentrics[3*i + 2]};

    // Interpolate vertexCurvatures.
    const float3 triangleValues = {vertexCurvatures[triangle.x], vertexCurvatures[triangle.y], vertexCurvatures[triangle.z]};
    const float interpValue = scalingFactor * dot(triangleValues, barycentric);

    float brightness = fabs(interpValue);
    if (brightness > 255) {
        brightness = 255;
    }
    const uchar val = convert_uchar(255 - brightness);

    // Convert to rgb.
    if (interpValue < 0) {
        // Valley fold.
        image[3 * i] = val;
        image[3 * i + 1] = val;
        image[3 * i + 2] = 255;
    } else {
        // Mountain fold.
        image[3 * i] = 255;
        image[3 * i + 1] = val;
        image[3 * i + 2] = val;
    }
}