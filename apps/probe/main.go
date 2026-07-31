package main

import (
	"flag"
	"fmt"
	"os"
)

const version = "0.0.0"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	showHelp := flag.Bool("help", false, "print help and exit")
	flag.Parse()

	if *showHelp || (flag.NArg() == 1 && flag.Arg(0) == "help") {
		printHelp()
		return
	}

	if *showVersion || (flag.NArg() == 1 && flag.Arg(0) == "version") {
		fmt.Printf("wdmbg-probe %s\n", version)
		return
	}

	// Phase 0 stub: capture/export logic lands later.
	fmt.Printf("wdmbg-probe %s — skeleton only; passive capture not implemented yet\n", version)
	fmt.Fprintln(os.Stderr, "See docs/PROBE.md for host-native + systemd deployment notes.")
}

func printHelp() {
	fmt.Print(`wdmbg-probe — WDMBG host probe (Phase 0 skeleton)

Usage:
  wdmbg-probe [flags]

Flags:
  -version    Print version and exit
  -help       Print this help and exit

Notes:
  This binary is a scaffold. Capture, batching, and HTTP POST to the API
  will be implemented in a later phase. Deploy as a host-native binary with
  systemd on Proxmox (not containerized in MVP).
`)
}
