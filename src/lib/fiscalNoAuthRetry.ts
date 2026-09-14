import type { AxiosRequestConfig } from "axios";

export type FiscalNoAuthRetryConfig = AxiosRequestConfig & {
  skipAuthRetry: true;
};

export const fiscalNoAuthRetryConfig: FiscalNoAuthRetryConfig = {
  skipAuthRetry: true,
};
