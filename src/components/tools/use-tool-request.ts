"use client";

import { useReducer } from "react";

const maximumUserFacingErrorLength = 300;

export interface ToolRequestState<TResult> {
  result: TResult | null;
  error: string | null;
  loading: boolean;
}

export type ToolRequestAction<TResult> =
  | { type: "start" }
  | { type: "success"; result: TResult }
  | { type: "failure"; error: string }
  | { type: "finish" };

export function toolRequestReducer<TResult>(
  state: ToolRequestState<TResult>,
  action: ToolRequestAction<TResult>,
): ToolRequestState<TResult> {
  switch (action.type) {
    case "start":
      return { result: null, error: null, loading: true };
    case "success":
      return { ...state, result: action.result, error: null };
    case "failure":
      return { ...state, result: null, error: action.error };
    case "finish":
      return { ...state, loading: false };
  }
}

export function isToolResponseRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function boundedMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.trim() || value.length > maximumUserFacingErrorLength) return null;
  return value;
}

export function toolResponseError(body: unknown, fallback: string): string {
  return isToolResponseRecord(body)
    ? (boundedMessage(body.error) ?? fallback)
    : fallback;
}

export function toolRequestError(reason: unknown, fallback: string): string {
  return reason instanceof Error
    ? (boundedMessage(reason.message) ?? fallback)
    : fallback;
}

export interface ExecuteToolRequestOptions<TRequest, TResult> {
  endpoint: string;
  createPayload: () => TRequest;
  parseResponse: (response: Response, body: unknown) => TResult;
  fetcher?: typeof fetch;
}

export async function executeToolRequest<TRequest, TResult>({
  endpoint,
  createPayload,
  parseResponse,
  fetcher = fetch,
}: ExecuteToolRequestOptions<TRequest, TResult>): Promise<TResult> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload()),
  });
  const body: unknown = await response.json();
  return parseResponse(response, body);
}

export function useToolRequest<TResult>(fallbackError: string) {
  const initialState: ToolRequestState<TResult> = {
    result: null,
    error: null,
    loading: false,
  };
  const [state, dispatch] = useReducer(
    toolRequestReducer<TResult>,
    initialState,
  );

  async function run<TRequest>(
    options: ExecuteToolRequestOptions<TRequest, TResult>,
  ): Promise<TResult | null> {
    dispatch({ type: "start" });
    try {
      const result = await executeToolRequest(options);
      dispatch({ type: "success", result });
      return result;
    } catch (reason) {
      dispatch({
        type: "failure",
        error: toolRequestError(reason, fallbackError),
      });
      return null;
    } finally {
      dispatch({ type: "finish" });
    }
  }

  return { ...state, run };
}
