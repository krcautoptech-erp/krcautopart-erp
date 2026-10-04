type PdfRuntimeEnvironment = Record<string, string | undefined>;

export function isServerlessPdfRuntime(environment: PdfRuntimeEnvironment): boolean {
  return Boolean(environment.VERCEL_ENV || environment.AWS_LAMBDA_FUNCTION_NAME);
}
