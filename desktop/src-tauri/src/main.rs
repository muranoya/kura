// Prevent console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kura_desktop_lib::run();
}
