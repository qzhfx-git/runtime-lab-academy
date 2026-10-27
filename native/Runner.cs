using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Runner {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A,B,C,D,E,F; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
        public uint cb; public string reserved, desktop, title;
        public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
        public ushort show, reserved2; public IntPtr reservedPtr, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
        public IntPtr process, thread; public uint pid, tid;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,ref ExtendedLimits limits,uint size);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref StartupInfo startup,out ProcessInfo info);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr obj,uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr p,out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr p,uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
    [DllImport("kernel32.dll")] static extern bool SetHandleInformation(IntPtr h,uint mask,uint flags);
    [DllImport("kernel32.dll")] static extern uint SetErrorMode(uint mode);
    static string Quote(string text) {
        StringBuilder b=new StringBuilder("\"");int slashes=0;
        foreach(char c in text) {
            if(c=='\\'){slashes++;continue;}
            if(c=='\"'){b.Append('\\',slashes*2+1);b.Append(c);slashes=0;continue;}
            b.Append('\\',slashes);slashes=0;b.Append(c);
        }
        b.Append('\\',slashes*2);b.Append('"');return b.ToString();
    }
    public static int Main(string[] args) {
        bool compiling=args.Length>0&&args[0]=="--compile";
        bool engineering=args.Length>0&&args[0]=="--engineering";
        bool debugging=args.Length>0&&args[0]=="--debug";
        bool extended=engineering||debugging;
        int first=(compiling||extended)?1:0;
        if(args.Length<first+1) return 125;
        SetErrorMode(0x0001|0x0002|0x8000);
        IntPtr job=CreateJobObject(IntPtr.Zero,null);
        if(job==IntPtr.Zero) { Console.Error.WriteLine("Runner: CreateJobObject failed");return 125; }
        ProcessInfo pi=new ProcessInfo();
        try {
            ExtendedLimits limits=new ExtendedLimits();
            limits.Basic.Flags=0x2000|0x100|0x8|0x2;
            limits.Basic.ActiveProcesses=extended?32u:compiling?16u:1u;
            limits.Basic.ProcessTime=extended?6000000000:compiling?250000000:20000000;
            limits.ProcessMemory=new UIntPtr(extended?1073741824u:compiling?536870912u:134217728u);
            if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits)))) {
                Console.Error.WriteLine("Runner: resource limits unavailable: "+Marshal.GetLastWin32Error());return 125;
            }
            StartupInfo si=new StartupInfo();si.cb=(uint)Marshal.SizeOf(typeof(StartupInfo));si.flags=0x100;
            si.input=GetStdHandle(-10);si.output=GetStdHandle(-11);si.error=GetStdHandle(-12);
            SetHandleInformation(si.input,1,1);SetHandleInformation(si.output,1,1);SetHandleInformation(si.error,1,1);
            string exe=System.IO.Path.GetFullPath(args[first]);
            StringBuilder cmd=new StringBuilder(Quote(exe));
            for(int i=first+1;i<args.Length;i++)cmd.Append(" "+Quote(args[i]));
            if(!CreateProcess(exe,cmd,IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,System.IO.Path.GetDirectoryName(exe),ref si,out pi)) {
                Console.Error.WriteLine("Runner: CreateProcess failed: "+Marshal.GetLastWin32Error());return 125;
            }
            if(!AssignProcessToJobObject(job,pi.process)) {
                TerminateProcess(pi.process,125);
                Console.Error.WriteLine("Runner: job assignment failed: "+Marshal.GetLastWin32Error());return 125;
            }
            ResumeThread(pi.thread);
            uint wait=WaitForSingleObject(pi.process,debugging?900000u:engineering?120000u:compiling?25000u:2200u);
            if(wait==258) { TerminateJobObject(job,124); WaitForSingleObject(pi.process,1000);return 124; }
            uint exitCode;GetExitCodeProcess(pi.process,out exitCode);
            if(exitCode==1816) return 124;
            return unchecked((int)exitCode);
        } finally {
            if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);
            if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);
            CloseHandle(job);
        }
    }
}
