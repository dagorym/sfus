import { Injectable } from "@nestjs/common";

export interface LogMetadata {
  [key: string]: unknown;
}

@Injectable()
export class JsonLogger {
  info(message: string, metadata?: LogMetadata, context?: string): void {
    this.write("info", message, metadata, context);
  }

  warn(message: string, metadata?: LogMetadata, context?: string): void {
    this.write("warn", message, metadata, context);
  }

  error(message: string, metadata?: LogMetadata, context?: string): void {
    this.write("error", message, metadata, context);
  }

  debug(message: string, metadata?: LogMetadata, context?: string): void {
    this.write("debug", message, metadata, context);
  }

  private write(level: string, message: string, metadata?: LogMetadata, context?: string): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
      ...(metadata ? { metadata } : {})
    };
    const line = `${JSON.stringify(payload)}\n`;

    if (level === "error" || level === "warn") {
      process.stderr.write(line);
      return;
    }

    process.stdout.write(line);
  }
}
