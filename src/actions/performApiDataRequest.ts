import { ActionCreator } from 'redux';
import { ApiDataState, Action } from '../reducer';
import { ApiDataEndpointConfig, ApiDataGlobalConfig, EndpointParams } from '../index';
import { getApiDataRequest } from '../selectors/getApiDataRequest';
import { apiDataFail } from './apiDataFail';
import { apiDataSuccess } from './apiDataSuccess';
import { getRequestKey } from '../helpers/getRequestKey';
import { formatUrl } from '../helpers/formatUrl';
import Request, { HandledResponse } from '../request';
import { cacheExpired } from '../selectors/cacheExpired';
import { RequestHandler } from '../request';

export const getRequestProperties = (endpointConfig: ApiDataEndpointConfig, globalConfig: ApiDataGlobalConfig, state: any, body?: any) => {
    const defaultProperties = { body, headers: {}, method: endpointConfig.method };
    const requestProperties = composeConfigFn(endpointConfig.setRequestProperties, globalConfig.setRequestProperties)(defaultProperties, state);
    requestProperties.headers = composeConfigFn(endpointConfig.setHeaders, globalConfig.setHeaders)(defaultProperties.headers, state);

    return requestProperties;
};

const composeConfigFn = (endpointFn?: any, globalFunction?: any): any => {
    const id = (val: any) => val;
    const fnA = endpointFn || id;
    const fnB = globalFunction || id;

    return (value: any, state: ApiDataState) => fnA(fnB(value, state));
};

let requestFunction = Request;

const __DEV__ = process.env.NODE_ENV === 'development';

/**
 * Manually trigger an request to an endpoint. Primarily used for any non-GET requests. For get requests it is preferred
 * to use {@link withApiData}.
 * @return {Promise<void>} Always resolves, use request networkStatus to see if call was succeeded or not.
 */
export const performApiRequest = (endpointKey: string, params?: EndpointParams, body?: any) => {
    return (dispatch: ActionCreator<Action>, getState: () => { apiData: ApiDataState }): Promise<void> => {
        const state = getState();
        const config = state.apiData.endpointConfig[endpointKey];
        const globalConfig = state.apiData.globalConfig;
        if (!config) {
            const errorMsg = `apiData.performApiRequest: no config with key ${endpointKey} found!`;
            if (__DEV__) {
                console.error(errorMsg);
            }
            return Promise.reject(errorMsg);
        }
        const apiDataRequest = getApiDataRequest(state.apiData, endpointKey, params);
        // don't re-trigger calls when already loading and don't re-trigger succeeded GET calls
        if (apiDataRequest && (
            apiDataRequest.networkStatus === 'loading' ||
            (config.method === 'GET' && apiDataRequest.networkStatus === 'success' && !cacheExpired(config, apiDataRequest))
        )) {
            return Promise.resolve();
        }

        const requestKey = getRequestKey(endpointKey, params || {});

        dispatch(({
            type: 'FETCH_API_DATA',
            payload: {
                requestKey,
                endpointKey,
                params
            }
        }));
        const requestProperties = getRequestProperties(config, globalConfig, state, body);

        const onError = (responseBody: any, response?: any) => {

            const updatedRequest = getApiDataRequest(getState().apiData, endpointKey, params);

            if (typeof config.afterError === 'function' && config.afterError(updatedRequest, dispatch, getState) === false) {
                return;
            }

            if (typeof globalConfig.afterError === 'function') {
                globalConfig.afterError(updatedRequest, dispatch, getState);
            }
        };

        const onBeforeError = (responseBody: any, response: any) => {
            const beforeError = config.beforeError || globalConfig.beforeError;

            if (beforeError && responseBody && !responseBody.ok) {
                const alteredResp = beforeError({ response, body: responseBody });
                responseBody = alteredResp && alteredResp.body ? alteredResp.body : responseBody;
                response = alteredResp && alteredResp.response ? alteredResp.response : response;

                if (typeof config.beforeError === 'function' && !response) {
                    return;
                }

                if (globalConfig.beforeError && response !== undefined && responseBody !== undefined) {
                    globalConfig.beforeError({ response, body: responseBody });
                }
            }
        };

        return new Promise((resolve: () => void) => {
            const timeout = config.timeout || globalConfig.timeout;
            let abortTimeout: any;
            let aborted = false;
            if (timeout) {
                abortTimeout = setTimeout(
                    () => {
                        const error = new Error('Timeout');
                        dispatch(apiDataFail(requestKey, error));
                        onError(error);
                        aborted = true;
                        resolve();
                    },
                    timeout
                );
            }
            requestFunction(formatUrl(config.url, params), requestProperties).then(
                ({ response, body: responseBody }: HandledResponse) => {
                    if (aborted) {
                        return;
                    }
                    clearTimeout(abortTimeout);
                    const beforeSuccess = config.beforeSuccess || globalConfig.beforeSuccess;
                    if (response.ok && beforeSuccess) {
                        const alteredResp = beforeSuccess({ response, body: responseBody });
                        response = alteredResp.response;
                        responseBody = alteredResp.body;
                    }
                    if (response.ok) {
                        dispatch(apiDataSuccess(requestKey, config, response, responseBody));

                        if (config.afterSuccess || globalConfig.afterSuccess) {
                            const updatedRequest = getApiDataRequest(getState().apiData, endpointKey, params);
                            if (config.afterSuccess && config.afterSuccess(updatedRequest, dispatch, getState) === false) {
                                return;
                            }
                            if (globalConfig.afterSuccess) {
                                globalConfig.afterSuccess(updatedRequest, dispatch, getState);
                            }
                        }
                    } else {
                        onBeforeError(responseBody, response);
                        dispatch(apiDataFail(requestKey, response, responseBody));
                        onError(responseBody, response);

                    }
                    resolve();
                },
                (error: any) => {
                    if (aborted) {
                        return;
                    }
                    clearTimeout(abortTimeout);
                    dispatch(apiDataFail(requestKey, undefined, error));
                    onError(error.body, error);
                    resolve();
                }
            );
        });
    };
};

/**
 * Use your own request function that calls the api and reads the responseBody response. Make sure it implements the
 * {@link RequestHandler} interface.
 * @param requestHandler
 */
export const useRequestHandler = (requestHandler: RequestHandler) => {
    requestFunction = requestHandler;
};