"use client";

import { ReactNode, useMemo } from "react";
import { CssBaseline, ThemeProvider, createTheme, responsiveFontSizes } from "@mui/material";

export default function Providers({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      responsiveFontSizes(
        createTheme({
          palette: {
            mode: "dark",
            background: {
              default: "#05070c",
              paper: "#0c111d"
            },
            primary: {
              main: "#00bcd4"
            }
          },
          shape: {
            borderRadius: 12
          },
          components: {
            MuiButton: {
              styleOverrides: {
                root: {
                  textTransform: "none",
                  borderRadius: 999
                }
              }
            },
            MuiCard: {
              styleOverrides: {
                root: {
                  backgroundImage: "none"
                }
              }
            }
          }
        })
      ),
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
