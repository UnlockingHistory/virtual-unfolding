// BFGS algorithm for optimizing position of 2D point, adapted from https://www.npmjs.com/package/bfgs-algorithm.

const minimize = require('minimize-golden-section-1d')

const DIM = 2;

type Options = {
	MAX_ITERATOR: number,
	ERROR: number,
}

/**
 * [BFGSAlgorithm description]
 */
export class BFGSAlgorithm {
	private x = [0, 0];
	private MAX_ITERATOR: number;
	private ERROR: number;

	private _gradient = [0, 0]; // Current gradient vector.
	private B = [[0, 0], [0, 0]]; // The inverse of approximate Hessian matrix.
	private constraintData!: Float32Array;
	private NUM_CONSTRAINTS = 0;
	private isConverged = false;

	constructor(options: Options) {
		this.MAX_ITERATOR = options.MAX_ITERATOR;
		this.ERROR = options.ERROR;
	}

	private set gradient(g: number[]) {
		this._gradient[0] = g[0];
		this._gradient[1] = g[1];
	}

	private get gradient() {
		return this._gradient;
	}

	// Define cost function.
	f(position2D: number[]) {
		const { constraintData, NUM_CONSTRAINTS } = this;
		let cost = 0;
		for (let i = 0; i < NUM_CONSTRAINTS; i++) {
			const diffX = position2D[0] - constraintData[3 * i];
			const diffY = position2D[1] - constraintData[3 * i + 1];
			const error = diffX*diffX + diffY*diffY - constraintData[3 * i + 2];
			cost += error*error;
		}
		return cost / NUM_CONSTRAINTS; // TODO: probably don't need to divide here.
	}

	// Define gradient function.
	private gradVector = [0, 0];
	df(position2D: number[]) {
		const { constraintData, NUM_CONSTRAINTS, gradVector } = this;
		// Clear grad vector and recompute.
		gradVector[0] = 0;
		gradVector[1] = 0;
		for (let i = 0; i < NUM_CONSTRAINTS; i++) {
			const diffX = position2D[0] - constraintData[3 * i];
			const diffY = position2D[1] - constraintData[3 * i + 1];
			const error = diffX*diffX + diffY*diffY - constraintData[3 * i + 2];
			const scale = 2 * error;// TODO: probably don't need to multiply by 2 here.
			gradVector[0] += scale * diffX;
			gradVector[1] += scale * diffY;
		}
		// TODO: probably don't need to divide here.
		gradVector[0] /= NUM_CONSTRAINTS;
		gradVector[1] /= NUM_CONSTRAINTS;
		return gradVector;
	}

	private s = [0, 0];
	private p = [0, 0]; // Direction: p[k]
    step() {
        let i, j;

        ////////////////////////////////////////////////////////////////
        // 0. Convergence is checked by observing the norm of the gradient
        // 
        let convergence = 0;
        for (i = 0; i < DIM; i++) {
            convergence += this.gradient[i] * this.gradient[i];
        }
        convergence = Math.sqrt(convergence);
        if (isNaN(convergence)) {
			console.log('BFGS: the norm of the gradient was unconverged.');
			return false;
        }
        if (convergence < this.ERROR) {
            this.isConverged = true;
            return true;
        }

        ////////////////////////////////////////////////////////////////
        // 1. obtain a direction pk by solving: P[k] = - B[k] * ▽f(x[k])
        // 搜索方向 done: p 
        for (i = 0; i < DIM; i++) {
            this.p[i] = 0;
            for (j = 0; j < DIM; j++) {
                this.p[i] += -this.B[i][j] * this.gradient[j];
            }
        }

        ////////////////////////////////////////////////////////////////
        // 2. lineSearch: min f(x + lamda * p)
		// 搜索步长 done: stepsize
		const self = this;
        const fNext = function(lamda: number) {
            const xNext = [0, 0];
            for (i = 0; i < DIM; i++) {
                xNext[i] = self.x[i] + lamda * self.p[i];
            }
            return self.f(xNext);
		}
		
		const stepsize = minimize(fNext, { guess: 0 });
        if (isNaN(stepsize)) {
			console.log('BFGS: can\'t find approximate stepsize.');
			return false;
        }
        
        ////////////////////////////////////////////////////////////////
        // 3. update: x[k + 1] = x[k] + stepsize * p[k],  s[k] = stepsize * p[k]
        // 求取heessian矩阵中间值 s done: s = stepsize * p
        // 下一次迭代点 done: s = stepsize * p
        for (i = 0; i < DIM; i++) {
            this.s[i] = stepsize * this.p[i];
            this.x[i] += this.s[i];
        }

        ////////////////////////////////////////////////////////////////
        // 4. next gradient: ▽f(x[k + 1]), y[k] = g[k + 1] - g[k]
        // 求取hessian矩阵中间值 y done: y = df(x[k + 1]) - df(x[k])
        const nextGradient = this.df(this.x);
        const y = [0, 0];
        for (i = 0; i < DIM; i++) {
            y[i] = nextGradient[i] - this.gradient[i];
        }
		this.gradient = nextGradient;

        ////////////////////////////////////////////////////////////////
        // 5. approximate hessian matrix
        // (T) => transposition
        
        // 5.1 let _scalarA = s(T) * y
        let _scalarA = 0;
        for (i = 0; i < DIM; i++) {
            _scalarA += this.s[i] * y[i];
        }

        // 5.2 let _vectorB = B * y
        const _vectorB = [];
        for (i = 0; i < DIM; i++) {
            _vectorB[i] = 0;
            for (j = 0; j < DIM; j++) {
                _vectorB[i] += this.B[i][j] * y[j];
            }
        }

        // 5.3 let _scalarC = (s(T) * y + y(T) * B * y) / (s(T) * y)2
        //                  = (_scalarA + y(T) * _vectorB) / (_scalarA * _scalarA)
        let _scalarC = 0;
        for (i = 0; i < DIM; i++) {
            _scalarC += y[i] * _vectorB[i];
        }
        _scalarC = (_scalarA + _scalarC) / (_scalarA * _scalarA);
        for (i = 0; i < DIM; i++) {
            for (j = 0; j < DIM; j++) {
                this.B[i][j] += _scalarC * this.s[i] * this.s[j] - (_vectorB[i] * this.s[j] + this.s[i] * _vectorB[j]) / _scalarA;
            }
        }

        return true;
    }

    run(x0: number[], constraintData: Float32Array, NUM_CONSTRAINTS: number) {
		// Set initial guess.
		this.x[0] = x0[0];
		this.x[1] = x0[1];
		// Save constraint data.
		this.constraintData = constraintData;
		this.NUM_CONSTRAINTS = NUM_CONSTRAINTS;
		// Init B as I to start.
		this.B[0][0] = 1;
		this.B[0][1] = 0;
		this.B[1][0] = 0;
		this.B[1][1] = 1;
		// Set initial gradient.
		this.gradient = this.df(this.x);
		// Set as unconverged to start.
		this.isConverged = false;

		let iterator = 0;
        while (true) {
			const success = this.step();
			if (!success) {
				return null;
			}

			if (this.isConverged) {
				return this.x;
            }

			// Check that we haven't exceeded max iterations.
			iterator++;
			if (iterator > this.MAX_ITERATOR) {
                return null;
            }
        }
    }
}