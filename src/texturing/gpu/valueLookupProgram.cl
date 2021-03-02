// Creates rainbow image from vertex values.

static float hue2rgb(const float p, const float q, float t) {
    // Copied from Threejs THREE.Color.
    if (t < 0.0f) t += 1.0f;
    if (t > 1.0f) t -= 1.0f;
    if (t < 1.0f/6.0f) return p + (q - p) * 6.0f * t;
    if (t < 0.5f) return q;
    if (t < 2.0f/3.0f) return p + (q - p) * 6.0f * (2.0f/3.0f - t);
    return p;
}

static float3 hsl2rgb(float h, float s, float l) {
    // Copied from Threejs THREE.Color.
    h = fmod(fmod(h, 1) + 1.0f, 1);
    // s = clamp(s, 0.0f, 1.0f);
    // l = clamp(l, 0.0f, 1.0f);
    if (s < 0) {
        s = 0.0f;
    } else if (s > 1) {
        s = 1.0f;
    }
    if (l < 0) {
        l = 0.0f;
    } else if (l > 1) {
        l = 1.0f;
    }

    if (s == 0) {
        float3 rgb = l;
        return rgb;
    }
    float p;
    if (l <= 0.5) {
        p = l * (1.0f + s);
    } else {
        p = l + s - l*s;
    }
    float q = 2.0f*l - p;

    float3 rgb = {hue2rgb(q, p, h + 1.0f/3.0f), hue2rgb(q, p, h), hue2rgb(q, p, h - 1.0f/3.0f)};
    return rgb;
}

__kernel void intValueToRGB(
	__global __write_only uchar *image,
	__global __read_only int *values,
    __global __read_only float *barycentrics,
	__global __read_only int *triangles2D,
	const int minVal,
	const int maxVal,
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

    // Interpolate values.
    int3 triangleValues = {values[triangle.x], values[triangle.y], values[triangle.z]};
    triangleValues = max(triangleValues, minVal);
    triangleValues = min(triangleValues, maxVal);

    float interpValue = dot(convert_float3(triangleValues), barycentric) - minVal;
    interpValue = clamp(interpValue, 0.0f, convert_float(maxVal - minVal));
    // Convert to rgb.
    const float scaledVal = (interpValue/convert_float(maxVal - minVal)) * 0.7f;
    const float3 rgb = hsl2rgb(scaledVal, 1.0f, 0.5f);
    const uchar3 rgbByte = convert_uchar3(rgb * 255.0f);

    image[3 * i] = rgbByte.x;
    image[3 * i + 1] = rgbByte.y;
    image[3 * i + 2] = rgbByte.z;
}

__kernel void floatValueToRGB(
	__global uchar *image,
	const __global float *values,
    const __global float *barycentrics,
	const __global int *triangles2D,
	const float minVal,
	const float maxVal,
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

    // Interpolate values.
    float3 triangleValues = {values[triangle.x], values[triangle.y], values[triangle.z]};
    triangleValues = max(triangleValues, minVal);
    triangleValues = min(triangleValues, maxVal);
    float interpValue = dot(triangleValues, barycentric) - minVal;
    interpValue = clamp(interpValue, 0.0f, maxVal - minVal);

    // Convert to rgb.
    const float scaledVal = (interpValue/(maxVal - minVal)) * 0.7f;
    const float3 rgb = hsl2rgb(scaledVal, 1.0f, 0.5f);
    const uchar3 rgbByte = convert_uchar3(rgb * 255.0f);

    image[3 * i] = rgbByte.x;
    image[3 * i + 1] = rgbByte.y;
    image[3 * i + 2] = rgbByte.z;
}
