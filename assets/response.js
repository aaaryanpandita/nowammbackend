export default class Response {
	constructor(result = {}, responseMessage = "Operation completed successfully") {
		this.result = result || {};
		this.responseMessage = responseMessage;
		this.responseCode = 200;
	}
}
