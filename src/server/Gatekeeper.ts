// src/server/Security.ts
import { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

export enum LimiterType {
  Get = "get",
  Post = "post",
  Put = "put",
  WebSocket = "websocket",
}

export interface Gatekeeper {
  // The wrapper for request handlers with optional rate limiting
  httpHandler: (
    limiterType: LimiterType,
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
  ) => (req: Request, res: Response, next: NextFunction) => Promise<void>;

  // The wrapper for WebSocket message handlers with rate limiting
  wsHandler: (
    req: http.IncomingMessage | string,
    fn: (message: string) => Promise<void>,
  ) => (message: string) => Promise<void>;
}

// Function to get the appropriate security middleware implementation
async function getGatekeeper(): Promise<Gatekeeper> {
  try {
    // Get the current file's directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    try {
      // Check if the file exists before attempting to import it
      const realMiddlewarePath = path.resolve(
        __dirname,
        "./gatekeeper/RealSecurityMiddleware.js",
      );
      const tsMiddlewarePath = path.resolve(
        __dirname,
        "./gatekeeper/RealSecurityMiddleware.ts",
      );

      if (
        !fs.existsSync(realMiddlewarePath) &&
        !fs.existsSync(tsMiddlewarePath)
      ) {
        console.log(
          "RealSecurityMiddleware file not found, using NoOpGatekeeper",
        );
        return new NoOpGatekeeper();
      }

      // Use dynamic import for ES modules
      // Using a type assertion to avoid TypeScript errors for optional modules
      const module = await import(
        "./gatekeeper/RealGatekeeper.js" as any
      ).catch(() => import("./gatekeeper/RealGatekeeper.js" as any));

      if (!module || !module.RealSecurityMiddleware) {
        console.log(
          "RealSecurityMiddleware class not found in module, using NoOpGatekeeper",
        );
        return new NoOpGatekeeper();
      }

      console.log("Successfully loaded real gatekeeper");
      return new module.RealGatekeeper();
    } catch (error) {
      console.log("Failed to load real gatekeeper:", error);
      return new NoOpGatekeeper();
    }
  } catch (e) {
    // Fall back to no-op if real implementation isn't available
    console.log("using no-op gatekeeper", e);
    return new NoOpGatekeeper();
  }
}

export class NoOpGatekeeper implements Gatekeeper {
  // Simple pass-through with no rate limiting
  httpHandler(
    limiterType: LimiterType,
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
  ) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  // Corrected implementation for WebSocket handler wrapper
  wsHandler(
    req: http.IncomingMessage | string,
    fn: (message: string) => Promise<void>,
  ) {
    return async (message: string) => {
      try {
        await fn(message);
      } catch (error) {
        console.error("WebSocket handler error:", error);
      }
    };
  }
}

// Initialize the security middleware with a default implementation
// We'll use the NoOpSecurityMiddleware initially and then replace it
// with the real implementation once it's loaded
export const gatekeeper: Gatekeeper = new NoOpGatekeeper();

// Immediately try to load the real middleware
getGatekeeper()
  .then((middleware) => {
    // Replace the methods of securityMiddleware with those from the loaded middleware
    Object.assign(gatekeeper, middleware);
  })
  .catch((error) => {
    console.error("Failed to initialize gatekeeper:", error);
  });
