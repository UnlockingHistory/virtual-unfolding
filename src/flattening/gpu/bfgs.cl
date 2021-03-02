// BFGS algorithm for optimizing position of 2D point, adapted from https://www.npmjs.com/package/bfgs-algorithm.
#import "src/common/gpu/utils.cl"

#define DIM 2
#define MAX_ITERATIONS_BFGS 20
#define ERRORSQ_BFGS 0.00001
#define PHI_RATIO_LINE_SEARCH 0.61803398875 //2 / (1 + Math.sqrt(5))
#define LOWER_BOUND_LINE_SEARCH -1.0f
#define UPPER_BOUND_LINE_SEARCH 4.0f
#define MAX_ITERATIONS_LINE_SEARCH 100
#define TOLERANCE_LINE_SEARCH 0.00001

// Define cost function.
static float f(const float2 x, const float constraintData[3 * MAX_BFGS_CONSTRAINTS], const int NUM_CONSTRAINTS) {
	float cost = 0;
	for (int i = 0; i < NUM_CONSTRAINTS; i++) {
		float2 neighborPosition = { constraintData[3 * i], constraintData[3 * i + 1] };
		float2 diff = x - neighborPosition;
		float error = dot(diff, diff) - constraintData[3 * i + 2];
		cost += error*error;
	}
	return cost / NUM_CONSTRAINTS; // TODO: probably don't need to divide here.
}

// Define gradient function.
static float2 df(const float2 x, float2 gradVector, const float constraintData[3 * MAX_BFGS_CONSTRAINTS], const int NUM_CONSTRAINTS) {
	// Allocate a zero gradient to start.
	gradVector.x = 0;
	gradVector.y = 0;
	for (int i = 0; i < NUM_CONSTRAINTS; i++) {
		float2 neighborPosition = { constraintData[3 * i], constraintData[3 * i + 1] };
		float2 diff = x - neighborPosition;
		float error = dot(diff, diff) - constraintData[3 * i + 2];
		float scale = 2 * error;// TODO: probably don't need to multiply by 2 here.
		gradVector += scale * diff;
	}
	// TODO: probably don't need to divide here.
	gradVector /= NUM_CONSTRAINTS;
	return gradVector;
}

static float fNext(const float lamda, const float2 x, const float2 p, const float constraintData[3 * MAX_BFGS_CONSTRAINTS], const int NUM_CONSTRAINTS) {
	float2 xNext = x + lamda * p;
	return f(xNext, constraintData, NUM_CONSTRAINTS);
}

// Adapted from https://www.npmjs.com/package/minimize-golden-section-1d.
static float goldenSectionMinimize(const float2 x, const float2 p, const float constraintData[3 * MAX_BFGS_CONSTRAINTS], const int NUM_CONSTRAINTS) {
	int iteration = 0;
	float xU = UPPER_BOUND_LINE_SEARCH;
	float xL = LOWER_BOUND_LINE_SEARCH;
	float x1 = xU - PHI_RATIO_LINE_SEARCH * (xU - xL);
	float x2 = xL + PHI_RATIO_LINE_SEARCH * (xU - xL);
	// Initial bounds.
	float f1 = fNext(x1, x, p, constraintData, NUM_CONSTRAINTS);
	float f2 = fNext(x2, x, p, constraintData, NUM_CONSTRAINTS);

	// Store these values so that we can return these if they're better.
	// This happens when the minimization falls *approaches* but never
	// actually reaches one of the bounds
	float f10 = fNext(xL, x, p, constraintData, NUM_CONSTRAINTS);
	float f20 = fNext(xU, x, p, constraintData, NUM_CONSTRAINTS);
	float xL0 = xL;
	float xU0 = xU;

	// Simple, robust golden section minimization:
	while (++iteration < MAX_ITERATIONS_LINE_SEARCH && fabs(xU - xL) > TOLERANCE_LINE_SEARCH) {
		if (f2 > f1) {
			xU = x2;
			x2 = x1;
			f2 = f1;
			x1 = xU - PHI_RATIO_LINE_SEARCH * (xU - xL);
			f1 = fNext(x1, x, p, constraintData, NUM_CONSTRAINTS);
		} else {
			xL = x1;
			x1 = x2;
			f1 = f2;
			x2 = xL + PHI_RATIO_LINE_SEARCH * (xU - xL);
			f2 = fNext(x2, x, p, constraintData, NUM_CONSTRAINTS);
		}
	}

	float xF = 0.5 * (xU + xL);
	float fF = 0.5 * (f1 + f2);

	
	if (isnan(f2) || isnan(f1) || iteration == MAX_ITERATIONS_LINE_SEARCH) {
		return NULL_FLOAT32;
	}

	if (f10 < fF) {
		return xL0;
	} else if (f20 < fF) {
		return xU0;
	}
	return xF;
}

static float2 BFGS(const float2 x0, const float constraintData[3 * MAX_BFGS_CONSTRAINTS], const int NUM_CONSTRAINTS) {
	// Set initial guess.
	float2 x = x0;
	
	// Init B as I to start.
	float B[DIM][DIM];
	B[0][0] = 1;
	B[0][1] = 0;
	B[1][0] = 0;
	B[1][1] = 1;

	// Init storage variables (to reduce allocations).
	float2 p, b, s, y, gradient, nextGradient;

	// Set initial gradient.
	gradient = df(x, gradient, constraintData, NUM_CONSTRAINTS);
	
	for (int i = 0; i < MAX_ITERATIONS_BFGS; i++) {
		// Obtain a direction pk by solving: P[k] = - B[k] * ▽f(x[k])
		// 搜索方向 done: p
		p.x = -B[0][0] * gradient.x - B[0][1] * gradient.y;
		p.y = -B[1][0] * gradient.x - B[1][1] * gradient.y;

		// LineSearch: min f(x + lamda * p)
		// 搜索步长 done: stepsize
		const float stepsize = goldenSectionMinimize(x, p, constraintData, NUM_CONSTRAINTS);
		if (stepsize == NULL_FLOAT32) {
			// Can't find approximate stepsize.
			x.x = NULL_FLOAT32;
			x.y = NULL_FLOAT32;
			return x;
		}
		
		// Update: x[k + 1] = x[k] + stepsize * p[k],  s[k] = stepsize * p[k]
		// 求取heessian矩阵中间值 s done: s = stepsize * p
		// 下一次迭代点 done: s = stepsize * p
		s.x = p.x * stepsize;
		s.y = p.y * stepsize;
		x += s;

		// Next gradient: ▽f(x[k + 1]), y[k] = g[k + 1] - g[k]
		// 求取hessian矩阵中间值 y done: y = df(x[k + 1]) - df(x[k])
		nextGradient = df(x, nextGradient, constraintData, NUM_CONSTRAINTS);
		y.x = nextGradient.x - gradient.x;
		y.y = nextGradient.y - gradient.y;
		gradient.x = nextGradient.x;
		gradient.y = nextGradient.y;

		// Convergence is checked by observing the norm of the gradient.
		if (dot(gradient, gradient) < ERRORSQ_BFGS) {
			// printf("(%f, %f), ", x.x, x.y);
			return x;
		}

		// Approximate hessian matrix
		// (T) => transposition
		// Let _scalarA = s(T) * y
		const float a = dot(s, y);
		// Let _vectorB = B * y
		b.x = B[0][0] * y.x + B[0][1] * y.y;
		b.y = B[1][0] * y.x + B[1][1] * y.y;

		// Let _scalarC = (s(T) * y + y(T) * B * y) / (s(T) * y)2
		// = (_scalarA + y(T) * _vectorB) / (_scalarA * _scalarA)
		const float c = (a + dot(y, b)) / (a * a);
		B[0][0] += c * s.x * s.x - (b.x * s.x + s.x * b.x) / a;
		B[0][1] += c * s.x * s.y - (b.x * s.y + s.x * b.y) / a;
		B[1][0] += c * s.y * s.x - (b.y * s.x + s.y * b.x) / a;
		B[1][1] += c * s.y * s.y - (b.y * s.y + s.y * b.y) / a;
	}

	// We have exceeded max iterations.
	x.x = NULL_FLOAT32;
	x.y = NULL_FLOAT32;
	return x;
}