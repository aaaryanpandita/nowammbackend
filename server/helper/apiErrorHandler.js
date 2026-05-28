const apiErrorhandler = (err, req, res, next) => {
    if (err.isApiError) {
        res.status(err.responseCode).json({
            responseCode: err.responseCode,
            responseMessage: err.responseMessage,
        });
        return;
    }
    if (err.message == 'Validation error') {
        res.status(502).json({
            code: 502,
            responseMessage: err.original.message,
        });
        return;
    }
    const statusCode = (typeof err.code === 'number' && err.code >= 100 && err.code <= 599)
        ? err.code
        : 500;
    res.status(statusCode)
};
module.exports = apiErrorhandler;