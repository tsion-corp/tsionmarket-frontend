"use client";

import { motion } from "motion/react";

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 1.05, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
