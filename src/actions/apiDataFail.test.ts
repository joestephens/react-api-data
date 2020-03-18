import { apiDataFail } from './apiDataFail';

describe('ApiDataFail action creator', () => {
    test('should set up the ApiDataFail action object without a response', () => {
        const action = apiDataFail('getData', { data: 'test-data' }, undefined);

        expect(action).toEqual({
            type: 'API_DATA_FAIL',
            payload: {
                requestKey: 'getData',
                errorBody: {
                    data: 'test-data',
                },
                response: undefined,
            },
        });
    });

    test('should set up the ApiDataFail action object with all parameter values', () => {
        const response = {
            ok: false,
            redirected: false,
            data: 'test-data',
            statusText: 'Not Found',
            url: 'https://myapi.org/myData',
        };

        // @ts-ignore
        const action = apiDataFail('getData', { data: 'test-data' }, response);

        expect(action).toEqual({
            type: 'API_DATA_FAIL',
            payload: {
                requestKey: 'getData',
                errorBody: {
                    data: 'test-data',
                },
                response,
            },
        });
    });
});
