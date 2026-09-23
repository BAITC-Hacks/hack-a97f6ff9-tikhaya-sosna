import {
  correlationFrom,
  createFailure,
  isRuntimeChannelMessage,
  type RuntimeResponse,
} from '../contracts';
import { routeRuntimeMessage, type RuntimeSender } from './runtime-router';

export type RuntimeHandler = (
  message: unknown,
  sender: RuntimeSender,
  runtimeId: string,
) => RuntimeResponse | undefined | Promise<RuntimeResponse | undefined>;

export type RuntimeMessageListener = (
  message: unknown,
  sender: RuntimeSender,
  sendResponse: (response: RuntimeResponse) => void,
) => boolean;

export interface RuntimeMessageEvent {
  addListener(listener: RuntimeMessageListener): void;
  removeListener(listener: RuntimeMessageListener): void;
}

export function createRuntimeListener(
  runtimeId: string,
  handler: RuntimeHandler = routeRuntimeMessage,
): RuntimeMessageListener {
  return (message, sender, sendResponse) => {
    if (!isRuntimeChannelMessage(message)) return false;

    const { requestId, type } = correlationFrom(message);
    let responded = false;
    const respondOnce = (response: RuntimeResponse): void => {
      if (responded) return;
      responded = true;
      sendResponse(response);
    };
    const internalError = (): RuntimeResponse => createFailure('INTERNAL_ERROR', requestId, type);

    Promise.resolve()
      .then(() => handler(message, sender, runtimeId))
      .then((response) => respondOnce(response ?? internalError()))
      .catch(() => respondOnce(internalError()));

    return true;
  };
}

export function registerRuntimeListener(
  event: RuntimeMessageEvent,
  runtimeId: string,
  handler: RuntimeHandler = routeRuntimeMessage,
): () => void {
  const listener = createRuntimeListener(runtimeId, handler);
  event.addListener(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    event.removeListener(listener);
  };
}
