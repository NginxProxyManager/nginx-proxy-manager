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
              default: "#040507",
              paper: "rgba(15, 21, 33, 0.88)"
            },
            primary: {
              main: "#7f5bff"
            },
            secondary: {
              main: "#22d3ee"
            },
            text: {
              primary: "#f5f7fb",
              secondary: "rgba(232, 236, 255, 0.6)"
            }
          },
          typography: {
            fontFamily: ['"Inter"', '"Segoe UI"', "Roboto", "sans-serif"].join(","),
            h4: {
              fontWeight: 700,
              letterSpacing: "-0.015em"
            }
          },
          shape: {
            borderRadius: 12
          },
          components: {
            MuiCssBaseline: {
              styleOverrides: {
                body: {
                  backgroundImage:
                    "radial-gradient(circle at top left, rgba(79, 70, 229, 0.28), transparent 45%), radial-gradient(circle at 80% 20%, rgba(14, 165, 233, 0.25), transparent 50%), linear-gradient(160deg, #020309 0%, #030710 45%, #040607 100%)"
                }
              }
            },
            MuiButton: {
              styleOverrides: {
                root: {
                  textTransform: "none",
                  borderRadius: 999,
                  fontWeight: 600,
                  paddingInline: 20
                }
              }
            },
            MuiCard: {
              styleOverrides: {
                root: {
                  backgroundImage: "none",
                  backgroundColor: "rgba(15, 21, 33, 0.9)",
                  border: "1px solid rgba(127, 91, 255, 0.18)",
                  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.4)",
                  backdropFilter: "blur(22px)"
                }
              }
            },
            MuiPaper: {
              styleOverrides: {
                root: {
                  backgroundColor: "rgba(15, 21, 33, 0.92)",
                  backgroundImage: "none",
                  borderRadius: 16,
                  border: "1px solid rgba(148, 163, 184, 0.08)",
                  boxShadow: "0 18px 48px rgba(2, 6, 23, 0.45)",
                  backdropFilter: "blur(18px)"
                }
              }
            },
            MuiTextField: {
              styleOverrides: {
                root: {
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(13, 18, 30, 0.75)",
                    borderRadius: 14,
                    "& fieldset": {
                      borderColor: "rgba(148, 163, 184, 0.2)"
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(127, 91, 255, 0.6)"
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#7f5bff"
                    }
                  },
                  "& .MuiInputLabel-root": {
                    color: "rgba(229, 231, 235, 0.7)"
                  }
                }
              }
            },
            MuiListItemButton: {
              styleOverrides: {
                root: {
                  borderRadius: 14,
                  transition: "background-color 150ms ease, transform 150ms ease",
                  "&:hover": {
                    backgroundColor: "rgba(127, 91, 255, 0.1)",
                    transform: "translateX(2px)"
                  },
                  "&.Mui-selected": {
                    background: "linear-gradient(135deg, rgba(127, 91, 255, 0.9), rgba(34, 211, 238, 0.9))",
                    color: "#05030a",
                    boxShadow: "0 12px 30px rgba(34, 211, 238, 0.24)",
                    "&:hover": {
                      background: "linear-gradient(135deg, rgba(127, 91, 255, 0.8), rgba(34, 211, 238, 0.8))"
                    }
                  }
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
