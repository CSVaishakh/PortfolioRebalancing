from sklearn.linear_model import LogisticRegression
import numpy as np

class GlobalModel:
    def __init__(self):
        self.model = LogisticRegression()

    def train(self, X, y):
        self.model.fit(X,y)

    def getWeights(self):
        return {
            "coeff" : self.model.coef_.tolist(),
            "intercept" : self.model.intercept_.tolist() 
        }
    
    def setWeights(self, coeff, intercept):
        self.model.coef_ = np.array(coeff)
        self.model.intercept_ = np.array(intercept)